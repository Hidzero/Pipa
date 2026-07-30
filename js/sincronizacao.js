import { clearQueue, getConnectionLabel, getQueueSummary, readQueue, removeQueuedAction, renderConnectionStatus, syncOfflineQueue } from "./offline.js";
import { isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

let listenerBound = false;

export function renderSincronizacaoPage() {
  if (!app) {
    return;
  }

  renderSyncPage();

  if (!listenerBound) {
    window.addEventListener("pipa:offline-queue-updated", () => {
      if (window.location.hash === "#/sincronizacao") {
        renderSyncPage();
      }
    });
    listenerBound = true;
  }
}

function renderSyncPage() {
  const queue = readQueue();
  const summary = getQueueSummary();
  const canSync = navigator.onLine && isSupabaseConfigured() && queue.length > 0;

  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Sincronizacao</strong>
          <div>${getConnectionLabel()} · ${summary.total} pendente${summary.total === 1 ? "" : "s"}</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="dashboard-grid">
        ${metricCard("Pendentes", summary.total)}
        ${metricCard("Com erro", summary.failed)}
        ${metricCard("Tentadas", summary.withAttempts)}
        ${metricCard("Conexao", getConnectionLabel())}
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2 class="panel-title">Fila offline</h2>
            <p class="field-hint">Alteracoes feitas sem internet ficam aqui ate serem enviadas ao Supabase.</p>
          </div>
          <div class="inline-actions">
            <button class="button compact-button" type="button" id="sync-all-button" ${canSync ? "" : "disabled"}>Sincronizar agora</button>
            <button class="ghost-button compact-button danger-text" type="button" id="clear-queue-button" ${queue.length ? "" : "disabled"}>Descartar fila</button>
          </div>
        </div>
        ${renderQueueNotice(queue)}
        <div class="list sync-list">
          ${queue.length ? queue.map(renderQueueItem).join("") : `<div class="empty-state">Nenhuma alteracao pendente.</div>`}
        </div>
      </section>
    </section>
  `;

  bindSyncEvents();
  renderConnectionStatus();
}

function bindSyncEvents() {
  document.querySelector("#sync-all-button")?.addEventListener("click", async () => {
    const result = await syncOfflineQueue();
    showToast(result.synced ? "Sincronizacao executada." : "Nada foi sincronizado agora.");
    renderSyncPage();
  });

  document.querySelector("#clear-queue-button")?.addEventListener("click", () => {
    const queue = readQueue();
    if (!queue.length) {
      return;
    }

    const confirmed = window.confirm("Descartar todas as alteracoes pendentes? Essa acao nao envia os dados ao Supabase.");
    if (!confirmed) {
      return;
    }

    clearQueue();
    showToast("Fila offline descartada.");
    renderSyncPage();
  });

  document.querySelectorAll("[data-sync-one]").forEach((button) => {
    button.addEventListener("click", async () => {
      await syncOfflineQueue({ actionId: button.dataset.syncOne });
      renderSyncPage();
    });
  });

  document.querySelectorAll("[data-discard-one]").forEach((button) => {
    button.addEventListener("click", () => {
      const confirmed = window.confirm("Descartar esta alteracao pendente?");
      if (!confirmed) {
        return;
      }

      removeQueuedAction(button.dataset.discardOne);
      showToast("Pendencia descartada.");
      renderSyncPage();
    });
  });
}

function renderQueueNotice(queue) {
  if (!navigator.onLine) {
    return `<div class="alert-item sync-notice">Sem internet. Voce pode continuar usando o app; a sincronizacao sera tentada quando a conexao voltar.</div>`;
  }

  if (!isSupabaseConfigured()) {
    return `<div class="alert-item sync-notice">Supabase nao configurado. A fila nao pode ser enviada.</div>`;
  }

  if (queue.some((action) => action.lastError)) {
    return `<div class="alert-item sync-notice">Algumas pendencias falharam. Abra o erro abaixo, corrija o dado se necessario e tente novamente.</div>`;
  }

  return "";
}

function renderQueueItem(action) {
  const canSyncItem = navigator.onLine && isSupabaseConfigured();
  return `
    <article class="list-item sync-item">
      <div class="item-main">
        <strong>${escapeHtml(action.label || "Alteracao pendente")}</strong>
        <span>${formatOperation(action.operation)} em ${escapeHtml(action.table || "-")} · ${formatDateTime(action.createdAt)}</span>
        <span>Origem: ${escapeHtml(action.originRoute || "-")} · Tentativas: ${Number(action.attempts || 0)}</span>
      </div>
      <span class="status-pill ${action.lastError ? "warning" : "pending"}">${action.lastError ? "Com erro" : "Pendente"}</span>
      ${action.lastError ? `<p class="sync-error">${escapeHtml(action.lastError)}</p>` : ""}
      <details class="sync-payload">
        <summary>Ver dados salvos</summary>
        <pre>${escapeHtml(summarizeAction(action))}</pre>
      </details>
      <div class="button-row">
        <button class="ghost-button compact-button" type="button" data-sync-one="${escapeAttribute(action.id)}" ${canSyncItem ? "" : "disabled"}>Tentar agora</button>
        <button class="ghost-button compact-button danger-text" type="button" data-discard-one="${escapeAttribute(action.id)}">Descartar</button>
      </div>
    </article>
  `;
}

function metricCard(label, value) {
  return `
    <article class="card metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function summarizeAction(action) {
  const summary = {
    tabela: action.table,
    operacao: action.operation,
    filtro: action.match,
    dados: action.payload
  };
  return JSON.stringify(summary, null, 2);
}

function formatOperation(operation) {
  const labels = {
    insert: "Criacao",
    update: "Atualizacao",
    upsert: "Criacao/atualizacao"
  };

  return labels[operation] || operation || "Alteracao";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
