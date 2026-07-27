import { renderConnectionStatus } from "./offline.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const scheduleState = {
  agenda: [],
  pedidos: [],
  clientes: [],
  locais: [],
  motoristas: [],
  caminhoes: [],
  selectedScheduleId: null,
  formMode: null,
  viewMode: "dia",
  anchorDate: toInputDate(new Date()),
  motoristaFilter: "",
  caminhaoFilter: "",
  statusFilter: "",
  isLoading: false
};

const viewModes = [
  ["dia", "Dia"],
  ["semana", "Semana"],
  ["mes", "Mes"]
];

const orderStatuses = [
  ["", "Todos"],
  ["aguardando_confirmacao", "Aguardando confirmacao"],
  ["confirmado", "Confirmado"],
  ["agendado", "Agendado"],
  ["em_rota", "Em rota"],
  ["em_entrega", "Em entrega"],
  ["concluido", "Concluido"],
  ["cancelado", "Cancelado"]
];

export async function renderAgendaPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para gerenciar a agenda.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  renderShell(canWriteSchedule());
  bindShellEvents();
  await Promise.all([loadClientes(), loadLocais(), loadMotoristas(), loadCaminhoes(), loadPedidos()]);
  await loadAgenda();
}

function renderShell(canWrite) {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Agenda</strong>
          <div id="agenda-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="schedule-controls">
          <div class="segmented-control" role="group" aria-label="Visualizacao">
            ${viewModes.map(([value, label]) => `<button class="${scheduleState.viewMode === value ? "active" : ""}" type="button" data-view-mode="${value}">${label}</button>`).join("")}
          </div>
          <div class="field">
            <label for="agenda-date">Data</label>
            <input id="agenda-date" type="date" value="${scheduleState.anchorDate}">
          </div>
          <div class="button-row">
            <button class="ghost-button compact-button" type="button" id="previous-period-button">Anterior</button>
            <button class="ghost-button compact-button" type="button" id="today-button">Hoje</button>
            <button class="ghost-button compact-button" type="button" id="next-period-button">Proximo</button>
          </div>
        </div>

        <div class="toolbar agenda-toolbar">
          ${selectField("agenda-motorista-filter", "Motorista", scheduleState.motoristaFilter, getPersonOptions("Todos os motoristas", scheduleState.motoristas))}
          ${selectField("agenda-caminhao-filter", "Caminhao", scheduleState.caminhaoFilter, getTruckOptions("Todos os caminhoes"))}
          ${selectField("agenda-status-filter", "Status", scheduleState.statusFilter, orderStatuses)}
          ${canWrite ? `<button class="button" type="button" id="new-schedule-button">Agendar pedido</button>` : ""}
        </div>
      </section>

      <div id="schedule-form-container"></div>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title" id="agenda-period-label">Entregas agendadas</h2>
          <div class="list" id="agenda-list">
            <div class="empty-state">Carregando agenda...</div>
          </div>
        </div>

        <div class="detail-column" id="agenda-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione uma entrega agendada.</div>
          </section>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      scheduleState.viewMode = button.dataset.viewMode;
      renderShell(canWriteSchedule());
      bindShellEvents();
      await loadAgenda();
    });
  });

  document.querySelector("#agenda-date")?.addEventListener("change", async (event) => {
    scheduleState.anchorDate = event.target.value || toInputDate(new Date());
    await loadAgenda();
  });

  document.querySelector("#previous-period-button")?.addEventListener("click", async () => {
    movePeriod(-1);
    document.querySelector("#agenda-date").value = scheduleState.anchorDate;
    await loadAgenda();
  });

  document.querySelector("#today-button")?.addEventListener("click", async () => {
    scheduleState.anchorDate = toInputDate(new Date());
    document.querySelector("#agenda-date").value = scheduleState.anchorDate;
    await loadAgenda();
  });

  document.querySelector("#next-period-button")?.addEventListener("click", async () => {
    movePeriod(1);
    document.querySelector("#agenda-date").value = scheduleState.anchorDate;
    await loadAgenda();
  });

  document.querySelector("#agenda-motorista-filter")?.addEventListener("change", (event) => {
    scheduleState.motoristaFilter = event.target.value;
    renderAgendaList();
  });

  document.querySelector("#agenda-caminhao-filter")?.addEventListener("change", (event) => {
    scheduleState.caminhaoFilter = event.target.value;
    renderAgendaList();
  });

  document.querySelector("#agenda-status-filter")?.addEventListener("change", (event) => {
    scheduleState.statusFilter = event.target.value;
    renderAgendaList();
  });

  document.querySelector("#new-schedule-button")?.addEventListener("click", () => {
    scheduleState.formMode = "new";
    renderScheduleForm();
  });
}

async function loadClientes() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("clientes")
    .select("id, nome, telefone")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    scheduleState.clientes = [];
    showToast(error.message || "Nao foi possivel carregar clientes.");
    return;
  }

  scheduleState.clientes = data || [];
}

async function loadLocais() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("locais_entrega")
    .select("id, cliente_id, nome, endereco, latitude, longitude, ponto_referencia, informacoes_acesso")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: true });

  if (error) {
    scheduleState.locais = [];
    showToast(error.message || "Nao foi possivel carregar locais.");
    return;
  }

  scheduleState.locais = data || [];
}

async function loadMotoristas() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("perfis")
    .select("id, nome, funcao, ativo")
    .eq("empresa_id", profile.empresa_id)
    .eq("funcao", "motorista")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    scheduleState.motoristas = [];
    showToast(error.message || "Nao foi possivel carregar motoristas.");
    return;
  }

  scheduleState.motoristas = data || [];
}

async function loadCaminhoes() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("caminhoes")
    .select("id, nome, placa, capacidade_litros, status, ativo")
    .eq("empresa_id", profile.empresa_id)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    scheduleState.caminhoes = [];
    showToast(error.message || "Nao foi possivel carregar caminhoes.");
    return;
  }

  scheduleState.caminhoes = data || [];
}

async function loadPedidos() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("pedidos")
    .select("id, cliente_id, local_entrega_id, quantidade_solicitada_litros, data_hora_solicitada, valor_total, forma_pagamento, prioridade, observacoes, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    scheduleState.pedidos = [];
    showToast(error.message || "Nao foi possivel carregar pedidos.");
    return;
  }

  scheduleState.pedidos = data || [];
}

async function loadAgenda() {
  const profile = getCurrentProfile();
  const range = getCurrentRange();
  scheduleState.isLoading = true;
  updateCountLabel("Carregando...");
  updatePeriodLabel(range);

  const { data, error } = await supabaseClient
    .from("agenda_entregas")
    .select("id, pedido_id, motorista_id, caminhao_id, data_inicio, data_fim, ordem, observacoes, created_at")
    .eq("empresa_id", profile.empresa_id)
    .gte("data_inicio", range.start.toISOString())
    .lt("data_inicio", range.end.toISOString())
    .order("data_inicio", { ascending: true })
    .order("ordem", { ascending: true });

  scheduleState.isLoading = false;

  if (error) {
    showToast(error.message || "Nao foi possivel carregar agenda.");
    document.querySelector("#agenda-list").innerHTML = `<div class="empty-state">Erro ao carregar agenda.</div>`;
    updateCountLabel("Erro");
    return;
  }

  scheduleState.agenda = data || [];

  if (!scheduleState.selectedScheduleId || !scheduleState.agenda.some((item) => item.id === scheduleState.selectedScheduleId)) {
    scheduleState.selectedScheduleId = scheduleState.agenda[0]?.id || null;
  }

  renderAgendaList();
  renderSelectedSchedule();
}

function renderAgendaList() {
  const list = document.querySelector("#agenda-list");
  if (!list) {
    return;
  }

  const items = getFilteredAgenda();
  updateCountLabel(`${items.length} entrega${items.length === 1 ? "" : "s"}`);

  if (scheduleState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando agenda...</div>`;
    return;
  }

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Nenhuma entrega agendada neste periodo.</div>`;
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const pedido = getPedido(item.pedido_id);
      const cliente = getCliente(pedido?.cliente_id);
      const local = getLocal(pedido?.local_entrega_id);
      return `
        <button class="list-item list-button ${item.id === scheduleState.selectedScheduleId ? "selected" : ""}" type="button" data-schedule-id="${item.id}">
          <span class="item-main">
            <strong>${formatScheduleTime(item.data_inicio)} · ${escapeHtml(cliente?.nome || "Cliente nao encontrado")}</strong>
            <span>${formatLiters(pedido?.quantidade_solicitada_litros)} · ${escapeHtml(getDriverName(item.motorista_id) || "Sem motorista")}</span>
            <span>${escapeHtml(local?.endereco || "Local nao encontrado")}</span>
          </span>
          <span class="status-pill ${getStatusClass(pedido?.status)}">${formatOrderStatus(pedido?.status)}</span>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll("[data-schedule-id]").forEach((button) => {
    button.addEventListener("click", () => {
      scheduleState.selectedScheduleId = button.dataset.scheduleId;
      scheduleState.formMode = null;
      renderAgendaList();
      renderSelectedSchedule();
    });
  });
}

function renderSelectedSchedule() {
  const detail = document.querySelector("#agenda-detail");
  if (!detail) {
    return;
  }

  const item = getSelectedSchedule();
  if (!item) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione uma entrega agendada.</div>
      </section>
    `;
    return;
  }

  const pedido = getPedido(item.pedido_id);
  const cliente = getCliente(pedido?.cliente_id);
  const local = getLocal(pedido?.local_entrega_id);
  const canWrite = canWriteSchedule();

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(cliente?.nome || "Entrega agendada")}</h2>
          <p class="field-hint">${formatDateTime(item.data_inicio)} · Ordem ${item.ordem}</p>
        </div>
        ${canWrite ? `
          <div class="inline-actions">
            <button class="ghost-button compact-button" type="button" id="edit-schedule-button">Editar</button>
            <button class="ghost-button compact-button" type="button" id="move-up-button">Subir</button>
            <button class="ghost-button compact-button" type="button" id="move-down-button">Descer</button>
          </div>
        ` : ""}
      </div>

      <dl class="details-list">
        <div><dt>Status</dt><dd>${formatOrderStatus(pedido?.status)}</dd></div>
        <div><dt>Cliente</dt><dd>${escapeHtml(cliente?.nome || "-")}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(cliente?.telefone || "-")}</dd></div>
        <div><dt>Endereco</dt><dd>${escapeHtml(local?.endereco || "-")}</dd></div>
        <div><dt>Motorista</dt><dd>${escapeHtml(getDriverName(item.motorista_id) || "-")}</dd></div>
        <div><dt>Caminhao</dt><dd>${escapeHtml(getTruckName(item.caminhao_id) || "-")}</dd></div>
        <div><dt>Quantidade</dt><dd>${formatLiters(pedido?.quantidade_solicitada_litros)}</dd></div>
        <div><dt>Valor</dt><dd>${formatCurrency(pedido?.valor_total)}</dd></div>
        <div><dt>Acesso</dt><dd>${escapeHtml(local?.informacoes_acesso || "-")}</dd></div>
        <div><dt>Observacoes da agenda</dt><dd>${escapeHtml(item.observacoes || "-")}</dd></div>
      </dl>

      <div class="button-row">
        ${buildMapLink(local?.latitude, local?.longitude, local?.endereco)}
        ${buildWhatsAppLink(cliente?.telefone, cliente?.nome, item)}
      </div>
    </section>
  `;

  document.querySelector("#edit-schedule-button")?.addEventListener("click", () => {
    scheduleState.formMode = item.id;
    renderScheduleForm();
  });

  document.querySelector("#move-up-button")?.addEventListener("click", async () => {
    await moveScheduleOrder(item, -1);
  });

  document.querySelector("#move-down-button")?.addEventListener("click", async () => {
    await moveScheduleOrder(item, 1);
  });
}

function renderScheduleForm() {
  const container = document.querySelector("#schedule-form-container");
  if (!container) {
    return;
  }

  const isEdit = scheduleState.formMode && scheduleState.formMode !== "new";
  const item = isEdit ? scheduleState.agenda.find((agendaItem) => agendaItem.id === scheduleState.formMode) : {};
  const availableOrders = getSchedulableOrders(item?.pedido_id);

  container.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <h2 class="panel-title">${isEdit ? "Editar agendamento" : "Agendar pedido"}</h2>
        <button class="ghost-button compact-button" type="button" id="cancel-schedule-form">Cancelar</button>
      </div>
      <form class="form" id="schedule-form">
        <div class="form-grid">
          ${selectField("pedido_id", "Pedido", item?.pedido_id || availableOrders[0]?.id || "", getOrderOptions(availableOrders))}
          ${selectField("motorista_id", "Motorista", item?.motorista_id || "", getPersonOptions("Sem motorista", scheduleState.motoristas))}
          ${selectField("caminhao_id", "Caminhao", item?.caminhao_id || "", getTruckOptions("Sem caminhao"))}
          ${inputField("data_inicio", "Inicio", toDateTimeLocal(item?.data_inicio || getDefaultScheduleStart()), "datetime-local", true)}
          ${inputField("data_fim", "Fim", toDateTimeLocal(item?.data_fim), "datetime-local")}
          ${inputField("ordem", "Ordem", item?.ordem || nextOrderNumber(), "number", true, "1")}
        </div>
        ${textareaField("observacoes", "Observacoes", item?.observacoes)}
        <button class="button" type="submit">${isEdit ? "Salvar agendamento" : "Criar agendamento"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-schedule-form")?.addEventListener("click", () => {
    scheduleState.formMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#schedule-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSchedule(new FormData(event.currentTarget), item);
  });
}

async function saveSchedule(formData, existingItem = {}) {
  const profile = getCurrentProfile();
  const payload = {
    pedido_id: requiredText(formData, "pedido_id", "Selecione um pedido."),
    motorista_id: optionalText(formData, "motorista_id"),
    caminhao_id: optionalText(formData, "caminhao_id"),
    data_inicio: requiredDateTime(formData, "data_inicio", "Informe a data de inicio."),
    data_fim: optionalDateTime(formData, "data_fim"),
    ordem: positiveInteger(formData, "ordem", "Informe uma ordem maior que zero."),
    observacoes: optionalText(formData, "observacoes"),
    updated_by: profile.id
  };

  if (!payload.pedido_id || !payload.data_inicio || !payload.ordem) {
    return;
  }

  if (payload.data_fim && new Date(payload.data_fim) < new Date(payload.data_inicio)) {
    showToast("A data final nao pode ser anterior ao inicio.");
    return;
  }

  const isEdit = Boolean(existingItem?.id);
  const query = isEdit
    ? supabaseClient.from("agenda_entregas").update(payload).eq("id", existingItem.id)
    : supabaseClient.from("agenda_entregas").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      });

  const { error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o agendamento.");
    return;
  }

  await markOrderAsScheduled(payload.pedido_id);
  showToast(isEdit ? "Agendamento atualizado." : "Pedido agendado.");
  scheduleState.formMode = null;
  document.querySelector("#schedule-form-container").innerHTML = "";
  await loadPedidos();
  await loadAgenda();
}

async function markOrderAsScheduled(orderId) {
  const pedido = getPedido(orderId);
  if (!pedido || ["agendado", "em_rota", "em_entrega", "concluido", "cancelado"].includes(pedido.status)) {
    return;
  }

  const { error } = await supabaseClient
    .from("pedidos")
    .update({ status: "agendado" })
    .eq("id", orderId);

  if (error) {
    showToast("Agendamento salvo, mas o status do pedido nao foi atualizado.");
  }
}

async function moveScheduleOrder(item, direction) {
  const sameDay = getFilteredAgenda()
    .filter((agendaItem) => isSameDay(new Date(agendaItem.data_inicio), new Date(item.data_inicio)))
    .sort(compareAgendaItems);

  const index = sameDay.findIndex((agendaItem) => agendaItem.id === item.id);
  const target = sameDay[index + direction];
  if (!target) {
    showToast(direction < 0 ? "Esta entrega ja esta no inicio." : "Esta entrega ja esta no fim.");
    return;
  }

  const currentOrder = item.ordem;
  const targetOrder = target.ordem;
  const { error: firstError } = await supabaseClient
    .from("agenda_entregas")
    .update({ ordem: targetOrder })
    .eq("id", item.id);

  if (firstError) {
    showToast(firstError.message || "Nao foi possivel alterar a ordem.");
    return;
  }

  const { error: secondError } = await supabaseClient
    .from("agenda_entregas")
    .update({ ordem: currentOrder })
    .eq("id", target.id);

  if (secondError) {
    showToast(secondError.message || "Nao foi possivel concluir a alteracao da ordem.");
    return;
  }

  showToast("Ordem atualizada.");
  await loadAgenda();
}

function getFilteredAgenda() {
  return scheduleState.agenda
    .filter((item) => {
      const pedido = getPedido(item.pedido_id);
      const matchesDriver = !scheduleState.motoristaFilter || item.motorista_id === scheduleState.motoristaFilter;
      const matchesTruck = !scheduleState.caminhaoFilter || item.caminhao_id === scheduleState.caminhaoFilter;
      const matchesStatus = !scheduleState.statusFilter || pedido?.status === scheduleState.statusFilter;
      return matchesDriver && matchesTruck && matchesStatus;
    })
    .sort(compareAgendaItems);
}

function getSchedulableOrders(currentOrderId = null) {
  const scheduledOrderIds = new Set(scheduleState.agenda.map((item) => item.pedido_id));
  return scheduleState.pedidos.filter((pedido) => {
    if (pedido.id === currentOrderId) {
      return true;
    }
    if (scheduledOrderIds.has(pedido.id)) {
      return false;
    }
    return !["cancelado", "concluido"].includes(pedido.status);
  });
}

function getSelectedSchedule() {
  return scheduleState.agenda.find((item) => item.id === scheduleState.selectedScheduleId) || null;
}

function getPedido(id) {
  return scheduleState.pedidos.find((pedido) => pedido.id === id) || null;
}

function getCliente(id) {
  return scheduleState.clientes.find((cliente) => cliente.id === id) || null;
}

function getLocal(id) {
  return scheduleState.locais.find((local) => local.id === id) || null;
}

function getDriverName(id) {
  return scheduleState.motoristas.find((motorista) => motorista.id === id)?.nome || "";
}

function getTruckName(id) {
  const truck = scheduleState.caminhoes.find((caminhao) => caminhao.id === id);
  return truck ? `${truck.nome} · ${truck.placa}` : "";
}

function getOrderOptions(orders) {
  return orders.map((pedido) => {
    const cliente = getCliente(pedido.cliente_id);
    const local = getLocal(pedido.local_entrega_id);
    return [
      pedido.id,
      `${cliente?.nome || "Cliente"} · ${formatLiters(pedido.quantidade_solicitada_litros)} · ${local?.endereco || "Local"}`
    ];
  });
}

function getPersonOptions(emptyLabel, people) {
  return [["", emptyLabel], ...people.map((person) => [person.id, person.nome])];
}

function getTruckOptions(emptyLabel) {
  return [["", emptyLabel], ...scheduleState.caminhoes.map((truck) => [truck.id, `${truck.nome} · ${truck.placa}`])];
}

function compareAgendaItems(a, b) {
  const dateDiff = new Date(a.data_inicio) - new Date(b.data_inicio);
  if (dateDiff !== 0) {
    return dateDiff;
  }
  return Number(a.ordem || 0) - Number(b.ordem || 0);
}

function nextOrderNumber() {
  const targetDate = new Date(getDefaultScheduleStart());
  const sameDay = scheduleState.agenda.filter((item) => isSameDay(new Date(item.data_inicio), targetDate));
  return sameDay.length ? Math.max(...sameDay.map((item) => Number(item.ordem || 0))) + 1 : 1;
}

function getDefaultScheduleStart() {
  const date = parseInputDate(scheduleState.anchorDate);
  date.setHours(8, 0, 0, 0);
  return date.toISOString();
}

function getCurrentRange() {
  const date = parseInputDate(scheduleState.anchorDate);

  if (scheduleState.viewMode === "semana") {
    const start = startOfDay(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  if (scheduleState.viewMode === "mes") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return { start, end };
  }

  const start = startOfDay(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function movePeriod(direction) {
  const date = parseInputDate(scheduleState.anchorDate);
  if (scheduleState.viewMode === "semana") {
    date.setDate(date.getDate() + direction * 7);
  } else if (scheduleState.viewMode === "mes") {
    date.setMonth(date.getMonth() + direction);
  } else {
    date.setDate(date.getDate() + direction);
  }
  scheduleState.anchorDate = toInputDate(date);
}

function updatePeriodLabel(range) {
  const label = document.querySelector("#agenda-period-label");
  if (!label) {
    return;
  }

  if (scheduleState.viewMode === "dia") {
    label.textContent = `Entregas de ${formatDate(range.start)}`;
  } else if (scheduleState.viewMode === "semana") {
    const end = new Date(range.end);
    end.setDate(end.getDate() - 1);
    label.textContent = `Semana de ${formatDate(range.start)} a ${formatDate(end)}`;
  } else {
    label.textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(range.start);
  }
}

function updateCountLabel(text) {
  const label = document.querySelector("#agenda-count");
  if (label) {
    label.textContent = text;
  }
}

function inputField(name, label, value = "", type = "text", required = false, step = "") {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeAttribute(value ?? "")}" ${required ? "required" : ""} ${step ? `step="${step}"` : ""}>
    </div>
  `;
}

function textareaField(name, label, value = "") {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <textarea id="${name}" name="${name}">${escapeHtml(value || "")}</textarea>
    </div>
  `;
}

function selectField(name, label, selectedValue, options) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}" name="${name}" ${options.length ? "" : "disabled"}>
        ${options.length ? "" : `<option value="">Nenhuma opcao disponivel</option>`}
        ${options.map(([value, labelText]) => `<option value="${escapeAttribute(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(labelText)}</option>`).join("")}
      </select>
    </div>
  `;
}

function buildMapLink(latitude, longitude, address) {
  const target = latitude && longitude
    ? `${latitude},${longitude}`
    : encodeURIComponent(address || "");

  if (!target) {
    return `<span class="ghost-button compact-button disabled-link">Sem mapa</span>`;
  }

  return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${target}">Abrir mapa</a>`;
}

function buildWhatsAppLink(phone, name, item) {
  const digits = onlyDigits(phone);
  if (!digits) {
    return `<span class="ghost-button compact-button disabled-link">Sem WhatsApp</span>`;
  }

  const phoneNumber = digits.startsWith("55") ? digits : `55${digits}`;
  const message = encodeURIComponent(`Ola, ${name || "cliente"}. Sua entrega esta agendada para ${formatDateTime(item.data_inicio)}.`);
  return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://wa.me/${phoneNumber}?text=${message}">WhatsApp</a>`;
}

function canWriteSchedule() {
  const role = getCurrentProfile()?.funcao;
  return role === "administrador" || role === "atendente";
}

function requiredText(formData, field, message) {
  const value = optionalText(formData, field);
  if (!value) {
    showToast(message);
  }
  return value;
}

function optionalText(formData, field) {
  const value = String(formData.get(field) || "").trim();
  return value || null;
}

function requiredDateTime(formData, field, message) {
  const value = optionalDateTime(formData, field);
  if (!value) {
    showToast(message);
  }
  return value;
}

function optionalDateTime(formData, field) {
  const value = optionalText(formData, field);
  return value ? new Date(value).toISOString() : null;
}

function positiveInteger(formData, field, message) {
  const value = Number.parseInt(String(formData.get(field) || ""), 10);
  if (!Number.isInteger(value) || value <= 0) {
    showToast(message);
    return null;
  }
  return value;
}

function toDateTimeLocal(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatOrderStatus(status) {
  return orderStatuses.find(([value]) => value === (status || ""))?.[1] || "Status";
}

function getStatusClass(status) {
  if (status === "cancelado") {
    return "inactive";
  }
  if (status === "concluido") {
    return "active";
  }
  if (status === "em_entrega") {
    return "warning";
  }
  if (status === "em_rota" || status === "agendado") {
    return "info";
  }
  return "pending";
}

function formatScheduleTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(value);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatLiters(value) {
  return `${Number(value || 0).toLocaleString("pt-BR")} L`;
}

function parseInputDate(value) {
  const [year, month, day] = String(value || toInputDate(new Date())).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function toInputDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
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
      <h2 class="panel-title">Agenda</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
