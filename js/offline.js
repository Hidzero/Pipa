import { setOnlineStatus } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const QUEUE_KEY = "pipa.offlineQueue";

export function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function enqueueOfflineAction(action) {
  const queue = readQueue();
  queue.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    ...action
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  renderConnectionStatus();
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
  renderConnectionStatus();
}

export function enqueueSupabaseMutation({ table, operation, payload, match = null, options = null, label = "Alteracao" }) {
  enqueueOfflineAction({
    type: "supabase-mutation",
    table,
    operation,
    payload,
    match,
    options,
    label
  });
  showToast(`${label} salvo localmente. Sera sincronizado quando a internet voltar.`);
}

export async function syncOfflineQueue() {
  const queue = readQueue();
  if (!queue.length || !navigator.onLine || !isSupabaseConfigured()) {
    renderConnectionStatus();
    return { synced: 0, failed: queue.length };
  }

  const remaining = [];
  let synced = 0;

  for (const action of queue) {
    try {
      await executeQueuedAction(action);
      synced += 1;
    } catch (error) {
      remaining.push({
        ...action,
        attempts: Number(action.attempts || 0) + 1,
        lastError: error.message || "Falha ao sincronizar",
        lastAttemptAt: new Date().toISOString()
      });
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  renderConnectionStatus();

  if (synced > 0) {
    showToast(`${synced} alteracao${synced === 1 ? "" : "es"} sincronizada${synced === 1 ? "" : "s"}.`);
    window.dispatchEvent(new CustomEvent("pipa:offline-sync-complete", { detail: { synced, failed: remaining.length } }));
  }

  if (remaining.length > 0) {
    showToast(`${remaining.length} alteracao${remaining.length === 1 ? "" : "es"} ainda pendente${remaining.length === 1 ? "" : "s"}.`);
  }

  return { synced, failed: remaining.length };
}

async function executeQueuedAction(action) {
  if (action.type !== "supabase-mutation") {
    return;
  }

  let query;
  if (action.operation === "insert") {
    query = supabaseClient.from(action.table).insert(action.payload);
  } else if (action.operation === "update") {
    if (!action.match || !Object.keys(action.match).length) {
      throw new Error("Atualizacao offline sem filtro.");
    }
    query = supabaseClient.from(action.table).update(action.payload);
    Object.entries(action.match || {}).forEach(([field, value]) => {
      query = query.eq(field, value);
    });
  } else if (action.operation === "upsert") {
    query = supabaseClient.from(action.table).upsert(action.payload, action.options || undefined);
  } else {
    throw new Error("Operacao offline desconhecida.");
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

export function getConnectionLabel() {
  return navigator.onLine ? "Online" : "Offline";
}

export function renderConnectionStatus() {
  const status = document.querySelector("#connection-status");
  const pending = document.querySelector("#pending-sync-count");
  const queue = readQueue();

  if (status) {
    status.textContent = getConnectionLabel();
    status.classList.toggle("offline", !navigator.onLine);
  }

  if (pending) {
    pending.textContent = `${queue.length} pendente${queue.length === 1 ? "" : "s"}`;
  }
}

export function setupConnectivityListeners() {
  window.addEventListener("online", async () => {
    setOnlineStatus(true);
    renderConnectionStatus();
    showToast("Conexao restaurada. Sincronizando pendencias.");
    await syncOfflineQueue();
  });

  window.addEventListener("offline", () => {
    setOnlineStatus(false);
    renderConnectionStatus();
    showToast("Sem internet. Alteracoes podem ser salvas localmente.");
  });

  renderConnectionStatus();
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.warn("Falha ao registrar service worker", error);
  }
}
