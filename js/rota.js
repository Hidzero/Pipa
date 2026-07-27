import { renderConnectionStatus } from "./offline.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const routeState = {
  agenda: [],
  pedidos: [],
  clientes: [],
  locais: [],
  caminhoes: [],
  motoristas: [],
  selectedScheduleId: null,
  routeDate: toInputDate(new Date()),
  motoristaFilter: "",
  isLoading: false
};

const orderStatuses = [
  ["aguardando_confirmacao", "Aguardando confirmacao"],
  ["confirmado", "Confirmado"],
  ["agendado", "Agendado"],
  ["em_rota", "Em rota"],
  ["em_entrega", "Em entrega"],
  ["concluido", "Concluido"],
  ["cancelado", "Cancelado"]
];

const paymentMethods = [
  ["", "Nao informado"],
  ["dinheiro", "Dinheiro"],
  ["pix", "Pix"],
  ["cartao_credito", "Cartao de credito"],
  ["cartao_debito", "Cartao de debito"],
  ["boleto", "Boleto"],
  ["transferencia", "Transferencia"],
  ["outro", "Outro"]
];

export async function renderRotaPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para carregar a rota.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  if (profile.funcao === "motorista") {
    routeState.motoristaFilter = profile.id;
  }

  renderShell();
  bindShellEvents();
  await Promise.all([loadClientes(), loadLocais(), loadCaminhoes(), loadMotoristas(), loadPedidos()]);
  await loadRoute();
}

function renderShell() {
  const profile = getCurrentProfile();
  const isDriver = profile?.funcao === "motorista";

  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Rota do dia</strong>
          <div id="rota-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar route-toolbar">
          <div class="field">
            <label for="route-date">Data</label>
            <input id="route-date" type="date" value="${routeState.routeDate}">
          </div>
          ${isDriver ? "" : selectField("route-driver-filter", "Motorista", routeState.motoristaFilter, getDriverOptions("Todos os motoristas"))}
          <div class="button-row">
            <button class="ghost-button compact-button" type="button" id="previous-route-date">Anterior</button>
            <button class="ghost-button compact-button" type="button" id="today-route-date">Hoje</button>
            <button class="ghost-button compact-button" type="button" id="next-route-date">Proximo</button>
          </div>
        </div>
      </section>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title" id="route-date-label">Entregas</h2>
          <div class="list" id="route-list">
            <div class="empty-state">Carregando rota...</div>
          </div>
        </div>

        <div class="detail-column" id="route-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione uma entrega.</div>
          </section>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelector("#route-date")?.addEventListener("change", async (event) => {
    routeState.routeDate = event.target.value || toInputDate(new Date());
    await loadRoute();
  });

  document.querySelector("#route-driver-filter")?.addEventListener("change", (event) => {
    routeState.motoristaFilter = event.target.value;
    renderRouteList();
  });

  document.querySelector("#previous-route-date")?.addEventListener("click", async () => {
    moveDate(-1);
    document.querySelector("#route-date").value = routeState.routeDate;
    await loadRoute();
  });

  document.querySelector("#today-route-date")?.addEventListener("click", async () => {
    routeState.routeDate = toInputDate(new Date());
    document.querySelector("#route-date").value = routeState.routeDate;
    await loadRoute();
  });

  document.querySelector("#next-route-date")?.addEventListener("click", async () => {
    moveDate(1);
    document.querySelector("#route-date").value = routeState.routeDate;
    await loadRoute();
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
    routeState.clientes = [];
    showToast(error.message || "Nao foi possivel carregar clientes.");
    return;
  }

  routeState.clientes = data || [];
}

async function loadLocais() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("locais_entrega")
    .select("id, cliente_id, nome, endereco, latitude, longitude, ponto_referencia, informacoes_acesso")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: true });

  if (error) {
    routeState.locais = [];
    showToast(error.message || "Nao foi possivel carregar locais.");
    return;
  }

  routeState.locais = data || [];
}

async function loadCaminhoes() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("caminhoes")
    .select("id, nome, placa, capacidade_litros, ativo")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    routeState.caminhoes = [];
    showToast(error.message || "Nao foi possivel carregar caminhoes.");
    return;
  }

  routeState.caminhoes = data || [];
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
    routeState.motoristas = [];
    showToast(error.message || "Nao foi possivel carregar motoristas.");
    return;
  }

  routeState.motoristas = data || [];
}

async function loadPedidos() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("pedidos")
    .select("id, cliente_id, local_entrega_id, quantidade_solicitada_litros, data_hora_solicitada, valor_total, forma_pagamento, prioridade, observacoes, status")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    routeState.pedidos = [];
    showToast(error.message || "Nao foi possivel carregar pedidos.");
    return;
  }

  routeState.pedidos = data || [];
}

async function loadRoute() {
  const profile = getCurrentProfile();
  const start = parseInputDate(routeState.routeDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  routeState.isLoading = true;
  updateCountLabel("Carregando...");
  updateDateLabel(start);

  let query = supabaseClient
    .from("agenda_entregas")
    .select("id, pedido_id, motorista_id, caminhao_id, data_inicio, data_fim, ordem, observacoes")
    .eq("empresa_id", profile.empresa_id)
    .gte("data_inicio", start.toISOString())
    .lt("data_inicio", end.toISOString())
    .order("ordem", { ascending: true })
    .order("data_inicio", { ascending: true });

  if (profile.funcao === "motorista") {
    query = query.eq("motorista_id", profile.id);
  }

  const { data, error } = await query;
  routeState.isLoading = false;

  if (error) {
    showToast(error.message || "Nao foi possivel carregar a rota.");
    document.querySelector("#route-list").innerHTML = `<div class="empty-state">Erro ao carregar rota.</div>`;
    updateCountLabel("Erro");
    return;
  }

  routeState.agenda = data || [];

  if (!routeState.selectedScheduleId || !routeState.agenda.some((item) => item.id === routeState.selectedScheduleId)) {
    routeState.selectedScheduleId = routeState.agenda[0]?.id || null;
  }

  renderRouteList();
  renderSelectedRouteItem();
}

function renderRouteList() {
  const list = document.querySelector("#route-list");
  if (!list) {
    return;
  }

  const items = getFilteredRouteItems();
  updateCountLabel(`${items.length} entrega${items.length === 1 ? "" : "s"}`);

  if (routeState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando rota...</div>`;
    return;
  }

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Nenhuma entrega agendada para esta data.</div>`;
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const pedido = getPedido(item.pedido_id);
      const cliente = getCliente(pedido?.cliente_id);
      const local = getLocal(pedido?.local_entrega_id);
      return `
        <button class="list-item list-button ${item.id === routeState.selectedScheduleId ? "selected" : ""}" type="button" data-route-id="${item.id}">
          <span class="item-main">
            <strong>${String(item.ordem || 1).padStart(2, "0")} · ${formatTime(item.data_inicio)} · ${escapeHtml(cliente?.nome || "Cliente")}</strong>
            <span>${formatLiters(pedido?.quantidade_solicitada_litros)} · ${formatCurrency(pedido?.valor_total)}</span>
            <span>${escapeHtml(local?.endereco || "Local nao encontrado")}</span>
          </span>
          <span class="status-pill ${getStatusClass(pedido?.status)}">${formatOrderStatus(pedido?.status)}</span>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll("[data-route-id]").forEach((button) => {
    button.addEventListener("click", () => {
      routeState.selectedScheduleId = button.dataset.routeId;
      renderRouteList();
      renderSelectedRouteItem();
    });
  });
}

function renderSelectedRouteItem() {
  const detail = document.querySelector("#route-detail");
  if (!detail) {
    return;
  }

  const item = getSelectedRouteItem();
  if (!item) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione uma entrega.</div>
      </section>
    `;
    return;
  }

  const pedido = getPedido(item.pedido_id);
  const cliente = getCliente(pedido?.cliente_id);
  const local = getLocal(pedido?.local_entrega_id);
  const truck = getTruck(item.caminhao_id);
  const driverName = getDriverName(item.motorista_id);

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(cliente?.nome || "Entrega")}</h2>
          <p class="field-hint">Ordem ${item.ordem || 1} · ${formatDateTime(item.data_inicio)}</p>
        </div>
        <span class="status-pill ${getStatusClass(pedido?.status)}">${formatOrderStatus(pedido?.status)}</span>
      </div>

      <dl class="details-list">
        <div><dt>Telefone</dt><dd>${escapeHtml(cliente?.telefone || "-")}</dd></div>
        <div><dt>Endereco</dt><dd>${escapeHtml(local?.endereco || "-")}</dd></div>
        <div><dt>Referencia</dt><dd>${escapeHtml(local?.ponto_referencia || "-")}</dd></div>
        <div><dt>Acesso</dt><dd>${escapeHtml(local?.informacoes_acesso || "-")}</dd></div>
        <div><dt>Quantidade</dt><dd>${formatLiters(pedido?.quantidade_solicitada_litros)}</dd></div>
        <div><dt>Valor</dt><dd>${formatCurrency(pedido?.valor_total)}</dd></div>
        <div><dt>Pagamento</dt><dd>${formatPaymentMethod(pedido?.forma_pagamento)}</dd></div>
        <div><dt>Caminhao</dt><dd>${escapeHtml(truck ? `${truck.nome} · ${truck.placa}` : "-")}</dd></div>
        <div><dt>Motorista</dt><dd>${escapeHtml(driverName || "-")}</dd></div>
        <div><dt>Observacoes do pedido</dt><dd>${escapeHtml(pedido?.observacoes || "-")}</dd></div>
        <div><dt>Observacoes da agenda</dt><dd>${escapeHtml(item.observacoes || "-")}</dd></div>
      </dl>

      <div class="button-row">
        ${buildGoogleMapsLink(local?.latitude, local?.longitude, local?.endereco)}
        ${buildWazeLink(local?.latitude, local?.longitude, local?.endereco)}
        ${buildWhatsAppLink(cliente?.telefone, cliente?.nome, item)}
      </div>

      <div class="route-actions">
        ${buildStatusActions(pedido)}
      </div>
    </section>
  `;

  document.querySelectorAll("[data-next-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateOrderStatus(pedido, button.dataset.nextStatus);
    });
  });

  document.querySelector("#delivery-register-placeholder")?.addEventListener("click", () => {
    showToast("O registro completo da entrega sera implementado na Etapa 8.");
  });
}

function buildStatusActions(pedido) {
  if (!pedido || ["cancelado", "concluido"].includes(pedido.status)) {
    return `<div class="empty-state">Pedido sem acao de rota disponivel.</div>`;
  }

  if (pedido.status === "em_entrega") {
    return `
      <button class="button" type="button" id="delivery-register-placeholder">Registrar entrega</button>
      <p class="field-hint">O registro completo da entrega entra na Etapa 8.</p>
    `;
  }

  if (pedido.status === "em_rota") {
    return `<button class="button" type="button" data-next-status="em_entrega">Iniciar entrega</button>`;
  }

  return `<button class="button" type="button" data-next-status="em_rota">Sair para rota</button>`;
}

async function updateOrderStatus(pedido, nextStatus) {
  if (!pedido?.id) {
    return;
  }

  const { error } = await supabaseClient
    .from("pedidos")
    .update({ status: nextStatus })
    .eq("id", pedido.id);

  if (error) {
    showToast(error.message || "Nao foi possivel atualizar o status.");
    return;
  }

  pedido.status = nextStatus;
  showToast(nextStatus === "em_rota" ? "Entrega marcada como em rota." : "Entrega marcada como em entrega.");
  renderRouteList();
  renderSelectedRouteItem();
}

function getFilteredRouteItems() {
  return routeState.agenda
    .filter((item) => !routeState.motoristaFilter || item.motorista_id === routeState.motoristaFilter)
    .sort(compareRouteItems);
}

function getSelectedRouteItem() {
  return routeState.agenda.find((item) => item.id === routeState.selectedScheduleId) || null;
}

function getPedido(id) {
  return routeState.pedidos.find((pedido) => pedido.id === id) || null;
}

function getCliente(id) {
  return routeState.clientes.find((cliente) => cliente.id === id) || null;
}

function getLocal(id) {
  return routeState.locais.find((local) => local.id === id) || null;
}

function getTruck(id) {
  return routeState.caminhoes.find((truck) => truck.id === id) || null;
}

function getDriverName(id) {
  return routeState.motoristas.find((driver) => driver.id === id)?.nome || "";
}

function getDriverOptions(emptyLabel) {
  return [["", emptyLabel], ...routeState.motoristas.map((driver) => [driver.id, driver.nome])];
}

function compareRouteItems(a, b) {
  const orderDiff = Number(a.ordem || 0) - Number(b.ordem || 0);
  if (orderDiff !== 0) {
    return orderDiff;
  }
  return new Date(a.data_inicio) - new Date(b.data_inicio);
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

function buildGoogleMapsLink(latitude, longitude, address) {
  const target = latitude && longitude ? `${latitude},${longitude}` : encodeURIComponent(address || "");
  if (!target) {
    return `<span class="ghost-button compact-button disabled-link">Sem mapa</span>`;
  }
  return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${target}">Google Maps</a>`;
}

function buildWazeLink(latitude, longitude, address) {
  if (latitude && longitude) {
    return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes">Waze</a>`;
  }

  if (address) {
    return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes">Waze</a>`;
  }

  return `<span class="ghost-button compact-button disabled-link">Sem Waze</span>`;
}

function buildWhatsAppLink(phone, name, item) {
  const digits = onlyDigits(phone);
  if (!digits) {
    return `<span class="ghost-button compact-button disabled-link">Sem WhatsApp</span>`;
  }

  const phoneNumber = digits.startsWith("55") ? digits : `55${digits}`;
  const message = encodeURIComponent(`Ola, ${name || "cliente"}. Estamos seguindo com sua entrega agendada para ${formatDateTime(item.data_inicio)}.`);
  return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://wa.me/${phoneNumber}?text=${message}">WhatsApp</a>`;
}

function updateDateLabel(date) {
  const label = document.querySelector("#route-date-label");
  if (label) {
    label.textContent = `Entregas de ${formatDate(date)}`;
  }
}

function updateCountLabel(text) {
  const label = document.querySelector("#rota-count");
  if (label) {
    label.textContent = text;
  }
}

function moveDate(direction) {
  const date = parseInputDate(routeState.routeDate);
  date.setDate(date.getDate() + direction);
  routeState.routeDate = toInputDate(date);
}

function parseInputDate(value) {
  const [year, month, day] = String(value || toInputDate(new Date())).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toInputDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function formatOrderStatus(status) {
  return orderStatuses.find(([value]) => value === status)?.[1] || "Status";
}

function formatPaymentMethod(method) {
  return paymentMethods.find(([value]) => value === (method || ""))?.[1] || "Nao informado";
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

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(value);
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

function formatTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
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
      <h2 class="panel-title">Rota do motorista</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
