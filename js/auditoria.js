import { renderConnectionStatus } from "./offline.js";
import { bindPagination, getPageItems, normalizePage, renderPagination } from "./pagination.js";
import { canViewAudit } from "./permissions.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const auditState = {
  logs: [],
  actors: [],
  selectedLogId: null,
  currentPage: 1,
  searchTerm: "",
  tableFilter: "",
  actionFilter: "",
  isLoading: false
};

const tableLabels = {
  perfis: "Funcionarios",
  clientes: "Clientes",
  locais_entrega: "Locais de entrega",
  caminhoes: "Caminhoes",
  pedidos: "Pedidos",
  agenda_entregas: "Agenda",
  entregas: "Entregas",
  reservatorios_entrega: "Reservatorios",
  pagamentos: "Pagamentos",
  recibos: "Recibos",
  combustiveis: "Combustivel",
  despesas: "Despesas",
  caminhao_motoristas: "Motorista x caminhao",
  supervisor_funcionarios: "Supervisor x equipe"
};

const actionLabels = {
  insert: "Criacao",
  update: "Alteracao"
};

export async function renderAuditoriaPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para carregar auditoria.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  if (!canViewAudit(profile)) {
    renderUnavailable("Apenas administrador pode consultar auditoria.");
    return;
  }

  renderShell();
  bindShellEvents();
  await loadActors();
  await loadAuditLogs();
}

function renderShell() {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Auditoria</strong>
          <div id="audit-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar agenda-toolbar">
          <div class="field search-field">
            <label for="audit-search">Buscar</label>
            <input id="audit-search" type="search" placeholder="Usuario, tabela, campo ou registro" value="${escapeAttribute(auditState.searchTerm)}">
          </div>
          ${selectField("audit-table-filter", "Tabela", auditState.tableFilter, getTableOptions())}
          ${selectField("audit-action-filter", "Acao", auditState.actionFilter, getActionOptions())}
          <button class="ghost-button compact-button" type="button" id="refresh-audit-button">Atualizar</button>
        </div>
      </section>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title">Registros recentes</h2>
          <div class="list" id="audit-list">
            <div class="empty-state">Carregando auditoria...</div>
          </div>
        </div>

        <div class="detail-column" id="audit-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione um registro.</div>
          </section>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelector("#audit-search")?.addEventListener("input", (event) => {
    auditState.searchTerm = event.target.value;
    auditState.currentPage = 1;
    renderAuditList();
  });

  document.querySelector("#audit-table-filter")?.addEventListener("change", (event) => {
    auditState.tableFilter = event.target.value;
    auditState.currentPage = 1;
    renderAuditList();
  });

  document.querySelector("#audit-action-filter")?.addEventListener("change", (event) => {
    auditState.actionFilter = event.target.value;
    auditState.currentPage = 1;
    renderAuditList();
  });

  document.querySelector("#refresh-audit-button")?.addEventListener("click", async () => {
    await loadAuditLogs();
  });
}

async function loadActors() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("perfis")
    .select("id, nome, email")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    auditState.actors = [];
    showToast(error.message || "Nao foi possivel carregar usuarios.");
    return;
  }

  auditState.actors = data || [];
}

async function loadAuditLogs() {
  const profile = getCurrentProfile();
  auditState.isLoading = true;
  updateCountLabel("Carregando...");

  const { data, error } = await supabaseClient
    .from("audit_logs")
    .select("id, actor_id, table_name, record_id, action, changed_fields, old_data, new_data, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false })
    .limit(500);

  auditState.isLoading = false;

  if (error) {
    auditState.logs = [];
    showToast("Auditoria indisponivel. Execute o SQL supabase/audit-log.sql.");
    document.querySelector("#audit-list").innerHTML = `<div class="empty-state">Erro ao carregar auditoria.</div>`;
    updateCountLabel("Erro");
    return;
  }

  auditState.logs = data || [];

  if (!auditState.selectedLogId || !auditState.logs.some((log) => log.id === auditState.selectedLogId)) {
    auditState.selectedLogId = auditState.logs[0]?.id || null;
  }

  renderAuditList();
  renderSelectedAuditLog();
}

function renderAuditList() {
  const list = document.querySelector("#audit-list");
  if (!list) {
    return;
  }

  const logs = getFilteredLogs();
  auditState.currentPage = normalizePage(auditState.currentPage, logs.length);
  const pageLogs = getPageItems(logs, auditState.currentPage);
  updateCountLabel(`${logs.length} registro${logs.length === 1 ? "" : "s"}`);

  if (auditState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando auditoria...</div>`;
    return;
  }

  if (!logs.length) {
    list.innerHTML = `<div class="empty-state">Nenhum registro encontrado.</div>`;
    return;
  }

  list.innerHTML = pageLogs
    .map((log) => `
      <button class="list-item list-button ${log.id === auditState.selectedLogId ? "selected" : ""}" type="button" data-audit-id="${log.id}">
        <span class="item-main">
          <strong>${escapeHtml(formatTableName(log.table_name))} · ${escapeHtml(formatAction(log.action))}</strong>
          <span>${formatDateTime(log.created_at)} · ${escapeHtml(getActorName(log.actor_id))}</span>
          <span>${escapeHtml(formatChangedFields(log.changed_fields))}</span>
        </span>
        <span class="status-pill ${log.action === "insert" ? "active" : "info"}">${escapeHtml(formatAction(log.action))}</span>
      </button>
    `)
    .join("") + renderPagination(logs.length, auditState.currentPage);

  list.querySelectorAll("[data-audit-id]").forEach((button) => {
    button.addEventListener("click", () => {
      auditState.selectedLogId = button.dataset.auditId;
      renderAuditList();
      renderSelectedAuditLog();
    });
  });

  bindPagination(list, (page) => {
    auditState.currentPage = page;
    renderAuditList();
  });
}

function renderSelectedAuditLog() {
  const detail = document.querySelector("#audit-detail");
  if (!detail) {
    return;
  }

  const log = getSelectedLog();
  if (!log) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione um registro.</div>
      </section>
    `;
    return;
  }

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(formatTableName(log.table_name))}</h2>
          <p class="field-hint">${formatDateTime(log.created_at)} · ${escapeHtml(formatAction(log.action))}</p>
        </div>
        <span class="status-pill ${log.action === "insert" ? "active" : "info"}">${escapeHtml(formatAction(log.action))}</span>
      </div>

      <dl class="details-list">
        <div><dt>Usuario</dt><dd>${escapeHtml(getActorName(log.actor_id))}</dd></div>
        <div><dt>Tabela</dt><dd>${escapeHtml(log.table_name)}</dd></div>
        <div><dt>Registro</dt><dd>${escapeHtml(log.record_id || "-")}</dd></div>
        <div><dt>Campos alterados</dt><dd>${escapeHtml(formatChangedFields(log.changed_fields))}</dd></div>
      </dl>

      <section class="nested-panel">
        <h3>Alteracoes</h3>
        ${renderChangedFieldDetails(log)}
      </section>
    </section>
  `;
}

function renderChangedFieldDetails(log) {
  const fields = Array.isArray(log.changed_fields) ? log.changed_fields : [];
  if (!fields.length) {
    return `<div class="empty-state">Nenhum campo detalhado.</div>`;
  }

  return `
    <div class="list">
      ${fields.map((field) => `
        <article class="list-item">
          <strong>${escapeHtml(field)}</strong>
          <dl class="details-list compact-details">
            <div><dt>Antes</dt><dd>${escapeHtml(formatAuditValue(log.old_data?.[field]))}</dd></div>
            <div><dt>Depois</dt><dd>${escapeHtml(formatAuditValue(log.new_data?.[field]))}</dd></div>
          </dl>
        </article>
      `).join("")}
    </div>
  `;
}

function getFilteredLogs() {
  const term = normalize(auditState.searchTerm);
  return auditState.logs.filter((log) => {
    const matchesTable = !auditState.tableFilter || log.table_name === auditState.tableFilter;
    const matchesAction = !auditState.actionFilter || log.action === auditState.actionFilter;
    const matchesTerm = !term || [
      log.table_name,
      log.record_id,
      log.action,
      getActorName(log.actor_id),
      formatChangedFields(log.changed_fields)
    ].some((value) => normalize(value).includes(term));

    return matchesTable && matchesAction && matchesTerm;
  });
}

function getSelectedLog() {
  return auditState.logs.find((log) => log.id === auditState.selectedLogId) || null;
}

function getTableOptions() {
  return [
    ["", "Todas as tabelas"],
    ...Object.entries(tableLabels).map(([value, label]) => [value, label])
  ];
}

function getActionOptions() {
  return [
    ["", "Todas as acoes"],
    ["insert", "Criacao"],
    ["update", "Alteracao"]
  ];
}

function getActorName(actorId) {
  if (!actorId) {
    return "Sistema";
  }

  const actor = auditState.actors.find((item) => item.id === actorId);
  return actor ? actor.nome : actorId;
}

function formatTableName(tableName) {
  return tableLabels[tableName] || tableName || "-";
}

function formatAction(action) {
  return actionLabels[action] || action || "-";
}

function formatChangedFields(fields) {
  if (!Array.isArray(fields) || !fields.length) {
    return "-";
  }

  return fields.join(", ");
}

function formatAuditValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function selectField(name, label, selectedValue, options) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}" name="${name}">
        ${options.map(([value, labelText]) => `<option value="${escapeAttribute(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(labelText)}</option>`).join("")}
      </select>
    </div>
  `;
}

function updateCountLabel(text) {
  const label = document.querySelector("#audit-count");
  if (label) {
    label.textContent = text;
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function renderUnavailable(message) {
  app.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Auditoria</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
