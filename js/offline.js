import { setOnlineStatus } from "./state.js";
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
    ...action
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
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
  window.addEventListener("online", () => {
    setOnlineStatus(true);
    renderConnectionStatus();
    showToast("Conexao restaurada. A sincronizacao sera executada nas proximas etapas.");
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
