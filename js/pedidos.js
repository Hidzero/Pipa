import { enqueueSupabaseMutation, renderConnectionStatus } from "./offline.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const orderState = {
  pedidos: [],
  clientes: [],
  locais: [],
  selectedOrderId: null,
  searchTerm: "",
  statusFilter: "",
  formMode: null,
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

const priorities = [
  ["baixa", "Baixa"],
  ["normal", "Normal"],
  ["alta", "Alta"],
  ["urgente", "Urgente"]
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

export async function renderPedidosPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para gerenciar pedidos.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  renderShell(canWriteOrders());
  bindShellEvents();
  await Promise.all([loadClientes(), loadLocais()]);
  await loadPedidos();
}

function renderShell(canWrite) {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Pedidos</strong>
          <div id="pedidos-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar orders-toolbar">
          <div class="field search-field">
            <label for="pedidos-search">Buscar</label>
            <input id="pedidos-search" type="search" placeholder="Cliente, telefone, endereco ou status" value="${escapeAttribute(orderState.searchTerm)}">
          </div>
          <div class="field">
            <label for="pedidos-status-filter">Status</label>
            <select id="pedidos-status-filter">
              <option value="">Todos</option>
              ${orderStatuses.map(([value, label]) => `<option value="${value}" ${value === orderState.statusFilter ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          ${canWrite ? `<button class="button" type="button" id="new-order-button">Novo pedido</button>` : ""}
        </div>
      </section>

      <div id="order-form-container"></div>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title">Pedidos cadastrados</h2>
          <div class="list" id="pedidos-list">
            <div class="empty-state">Carregando pedidos...</div>
          </div>
        </div>

        <div class="detail-column" id="pedido-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione um pedido.</div>
          </section>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelector("#pedidos-search")?.addEventListener("input", (event) => {
    orderState.searchTerm = event.target.value;
    renderPedidosList();
  });

  document.querySelector("#pedidos-status-filter")?.addEventListener("change", (event) => {
    orderState.statusFilter = event.target.value;
    renderPedidosList();
  });

  document.querySelector("#new-order-button")?.addEventListener("click", () => {
    orderState.formMode = "new";
    renderOrderForm();
  });
}

async function loadClientes() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("clientes")
    .select("id, nome, telefone, cpf_cnpj, endereco, ativo")
    .eq("empresa_id", profile.empresa_id)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    orderState.clientes = [];
    showToast(error.message || "Nao foi possivel carregar clientes.");
    return;
  }

  orderState.clientes = data || [];
}

async function loadLocais() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("locais_entrega")
    .select("id, cliente_id, nome, endereco, latitude, longitude, ponto_referencia, informacoes_acesso, ativo")
    .eq("empresa_id", profile.empresa_id)
    .eq("ativo", true)
    .order("created_at", { ascending: true });

  if (error) {
    orderState.locais = [];
    showToast(error.message || "Nao foi possivel carregar locais de entrega.");
    return;
  }

  orderState.locais = data || [];
}

async function loadPedidos() {
  const profile = getCurrentProfile();
  orderState.isLoading = true;
  updateCountLabel("Carregando...");

  const { data, error } = await supabaseClient
    .from("pedidos")
    .select("id, cliente_id, local_entrega_id, quantidade_solicitada_litros, data_hora_solicitada, valor_total, forma_pagamento, prioridade, observacoes, status, motivo_cancelamento, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false });

  orderState.isLoading = false;

  if (error) {
    showToast(error.message || "Nao foi possivel carregar pedidos.");
    document.querySelector("#pedidos-list").innerHTML = `<div class="empty-state">Erro ao carregar pedidos.</div>`;
    updateCountLabel("Erro");
    return;
  }

  orderState.pedidos = data || [];

  if (!orderState.selectedOrderId || !orderState.pedidos.some((pedido) => pedido.id === orderState.selectedOrderId)) {
    orderState.selectedOrderId = orderState.pedidos[0]?.id || null;
  }

  renderPedidosList();
  renderSelectedOrder();
}

function renderPedidosList() {
  const list = document.querySelector("#pedidos-list");
  if (!list) {
    return;
  }

  const pedidos = getFilteredPedidos();
  updateCountLabel(`${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}`);

  if (orderState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando pedidos...</div>`;
    return;
  }

  if (!pedidos.length) {
    list.innerHTML = `<div class="empty-state">Nenhum pedido encontrado.</div>`;
    return;
  }

  list.innerHTML = pedidos
    .map((pedido) => {
      const cliente = getCliente(pedido.cliente_id);
      const local = getLocal(pedido.local_entrega_id);
      return `
        <button class="list-item list-button ${pedido.id === orderState.selectedOrderId ? "selected" : ""}" type="button" data-order-id="${pedido.id}">
          <span class="item-main">
            <strong>${escapeHtml(cliente?.nome || "Cliente nao encontrado")}</strong>
            <span>${formatDateTime(pedido.data_hora_solicitada)} · ${formatLiters(pedido.quantidade_solicitada_litros)}</span>
            <span>${escapeHtml(local?.endereco || "Local nao encontrado")}</span>
          </span>
          <span class="status-pill ${getStatusClass(pedido.status)}">${formatOrderStatus(pedido.status)}</span>
        </button>
      `;
    })
    .join("");

  list.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => {
      orderState.selectedOrderId = button.dataset.orderId;
      orderState.formMode = null;
      renderPedidosList();
      renderSelectedOrder();
    });
  });
}

function renderSelectedOrder() {
  const detail = document.querySelector("#pedido-detail");
  if (!detail) {
    return;
  }

  const pedido = getSelectedOrder();
  if (!pedido) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione um pedido.</div>
      </section>
    `;
    return;
  }

  const cliente = getCliente(pedido.cliente_id);
  const local = getLocal(pedido.local_entrega_id);
  const canWrite = canWriteOrders();
  const canEdit = canWrite && pedido.status !== "cancelado" && pedido.status !== "concluido";

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(cliente?.nome || "Pedido")}</h2>
          <p class="field-hint">${formatOrderStatus(pedido.status)} · ${formatCurrency(pedido.valor_total)}</p>
        </div>
        ${canWrite ? `
          <div class="inline-actions">
            ${canEdit ? `<button class="ghost-button compact-button" type="button" id="edit-order-button">Editar</button>` : ""}
            ${pedido.status !== "cancelado" ? `<button class="ghost-button compact-button danger-text" type="button" id="cancel-order-button">Cancelar</button>` : ""}
          </div>
        ` : ""}
      </div>

      <dl class="details-list">
        <div><dt>Cliente</dt><dd>${escapeHtml(cliente?.nome || "-")}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(cliente?.telefone || "-")}</dd></div>
        <div><dt>Local</dt><dd>${escapeHtml(local?.nome || "Local de entrega")}</dd></div>
        <div><dt>Endereco</dt><dd>${escapeHtml(local?.endereco || "-")}</dd></div>
        <div><dt>Data e horario</dt><dd>${formatDateTime(pedido.data_hora_solicitada)}</dd></div>
        <div><dt>Quantidade</dt><dd>${formatLiters(pedido.quantidade_solicitada_litros)}</dd></div>
        <div><dt>Valor</dt><dd>${formatCurrency(pedido.valor_total)}</dd></div>
        <div><dt>Pagamento</dt><dd>${formatPaymentMethod(pedido.forma_pagamento)}</dd></div>
        <div><dt>Prioridade</dt><dd>${formatPriority(pedido.prioridade)}</dd></div>
        <div><dt>Acesso</dt><dd>${escapeHtml(local?.informacoes_acesso || "-")}</dd></div>
        <div><dt>Observacoes</dt><dd>${escapeHtml(pedido.observacoes || "-")}</dd></div>
        ${pedido.motivo_cancelamento ? `<div><dt>Motivo do cancelamento</dt><dd>${escapeHtml(pedido.motivo_cancelamento)}</dd></div>` : ""}
      </dl>

      <div class="button-row">
        ${buildMapLink(local?.latitude, local?.longitude, local?.endereco)}
        ${buildWhatsAppLink(cliente?.telefone, cliente?.nome, pedido)}
      </div>
    </section>
  `;

  document.querySelector("#edit-order-button")?.addEventListener("click", () => {
    orderState.formMode = pedido.id;
    renderOrderForm();
  });

  document.querySelector("#cancel-order-button")?.addEventListener("click", async () => {
    await cancelOrder(pedido);
  });
}

function renderOrderForm() {
  const container = document.querySelector("#order-form-container");
  if (!container) {
    return;
  }

  const isEdit = orderState.formMode && orderState.formMode !== "new";
  const pedido = isEdit ? orderState.pedidos.find((item) => item.id === orderState.formMode) : {};
  const selectedClienteId = pedido?.cliente_id || orderState.clientes[0]?.id || "";

  container.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <h2 class="panel-title">${isEdit ? "Editar pedido" : "Novo pedido"}</h2>
        <button class="ghost-button compact-button" type="button" id="cancel-order-form">Cancelar</button>
      </div>
      <form class="form" id="order-form">
        <div class="form-grid">
          ${selectField("cliente_id", "Cliente", selectedClienteId, getClienteOptions())}
          ${selectField("local_entrega_id", "Local de entrega", pedido?.local_entrega_id || "", getLocalOptions(selectedClienteId))}
          ${inputField("quantidade_solicitada_litros", "Quantidade em litros", pedido?.quantidade_solicitada_litros, "number", true, "1")}
          ${inputField("data_hora_solicitada", "Data e horario", toDateTimeLocal(pedido?.data_hora_solicitada), "datetime-local")}
          ${inputField("valor_total", "Valor", pedido?.valor_total ?? 0, "number", true, "0.01")}
          ${selectField("forma_pagamento", "Forma de pagamento", pedido?.forma_pagamento || "", paymentMethods)}
          ${selectField("prioridade", "Prioridade", pedido?.prioridade || "normal", priorities)}
          ${selectField("status", "Status", pedido?.status || "aguardando_confirmacao", orderStatuses)}
        </div>
        ${textareaField("observacoes", "Observacoes", pedido?.observacoes)}
        <button class="button" type="submit">${isEdit ? "Salvar pedido" : "Cadastrar pedido"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-order-form")?.addEventListener("click", () => {
    orderState.formMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#cliente_id")?.addEventListener("change", (event) => {
    const localSelect = document.querySelector("#local_entrega_id");
    if (!localSelect) {
      return;
    }
    localSelect.innerHTML = getLocalOptions(event.target.value)
      .map(([value, label]) => `<option value="${escapeAttribute(value)}">${escapeHtml(label)}</option>`)
      .join("");
  });

  document.querySelector("#order-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveOrder(new FormData(event.currentTarget), pedido);
  });
}

async function saveOrder(formData, existingOrder = {}) {
  const profile = getCurrentProfile();
  const payload = {
    cliente_id: requiredText(formData, "cliente_id", "Selecione um cliente."),
    local_entrega_id: requiredText(formData, "local_entrega_id", "Selecione um local de entrega."),
    quantidade_solicitada_litros: positiveInteger(formData, "quantidade_solicitada_litros", "Informe a quantidade em litros."),
    data_hora_solicitada: optionalDateTime(formData, "data_hora_solicitada"),
    valor_total: nonNegativeNumber(formData, "valor_total", "Informe um valor valido."),
    forma_pagamento: optionalText(formData, "forma_pagamento"),
    prioridade: String(formData.get("prioridade") || "normal"),
    status: String(formData.get("status") || "aguardando_confirmacao"),
    observacoes: optionalText(formData, "observacoes")
  };

  if (!payload.cliente_id || !payload.local_entrega_id || !payload.quantidade_solicitada_litros || payload.valor_total === null) {
    return;
  }

  if (!orderState.locais.some((local) => local.id === payload.local_entrega_id && local.cliente_id === payload.cliente_id)) {
    showToast("O local selecionado nao pertence ao cliente.");
    return;
  }

  const isEdit = Boolean(existingOrder?.id);
  if (!navigator.onLine) {
    enqueueSupabaseMutation({
      table: "pedidos",
      operation: isEdit ? "update" : "insert",
      payload: isEdit ? payload : {
        ...payload,
        empresa_id: profile.empresa_id,
        criado_por: profile.id
      },
      match: isEdit ? { id: existingOrder.id } : null,
      label: isEdit ? "Pedido atualizado" : "Pedido cadastrado"
    });
    orderState.formMode = null;
    document.querySelector("#order-form-container").innerHTML = "";
    return;
  }

  const query = isEdit
    ? supabaseClient.from("pedidos").update(payload).eq("id", existingOrder.id)
    : supabaseClient.from("pedidos").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        criado_por: profile.id
      });

  const { error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o pedido.");
    return;
  }

  showToast(isEdit ? "Pedido atualizado." : "Pedido cadastrado.");
  orderState.formMode = null;
  document.querySelector("#order-form-container").innerHTML = "";
  await loadPedidos();
}

async function cancelOrder(pedido) {
  const profile = getCurrentProfile();
  const reason = window.prompt("Informe o motivo do cancelamento:");
  if (reason === null) {
    return;
  }

  const { error } = await supabaseClient
    .from("pedidos")
    .update({
      status: "cancelado",
      cancelado_por: profile.id,
      cancelado_em: new Date().toISOString(),
      motivo_cancelamento: reason.trim() || "Cancelado pelo usuario"
    })
    .eq("id", pedido.id);

  if (error) {
    showToast(error.message || "Nao foi possivel cancelar o pedido.");
    return;
  }

  showToast("Pedido cancelado.");
  await loadPedidos();
}

function getFilteredPedidos() {
  const term = normalize(orderState.searchTerm);
  return orderState.pedidos.filter((pedido) => {
    const cliente = getCliente(pedido.cliente_id);
    const local = getLocal(pedido.local_entrega_id);
    const matchesStatus = !orderState.statusFilter || pedido.status === orderState.statusFilter;
    const matchesTerm = !term || [
      cliente?.nome,
      cliente?.telefone,
      cliente?.cpf_cnpj,
      local?.endereco,
      pedido.status,
      pedido.prioridade
    ].some((value) => normalize(value).includes(term));

    return matchesStatus && matchesTerm;
  });
}

function getSelectedOrder() {
  return orderState.pedidos.find((pedido) => pedido.id === orderState.selectedOrderId) || null;
}

function getCliente(id) {
  return orderState.clientes.find((cliente) => cliente.id === id) || null;
}

function getLocal(id) {
  return orderState.locais.find((local) => local.id === id) || null;
}

function getClienteOptions() {
  return orderState.clientes.map((cliente) => [cliente.id, cliente.nome]);
}

function getLocalOptions(clienteId) {
  const locais = orderState.locais.filter((local) => local.cliente_id === clienteId);
  return locais.map((local) => [local.id, `${local.nome || "Local"} - ${local.endereco}`]);
}

function canWriteOrders() {
  const role = getCurrentProfile()?.funcao;
  return role === "administrador" || role === "atendente";
}

function updateCountLabel(text) {
  const label = document.querySelector("#pedidos-count");
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

function buildWhatsAppLink(phone, name, pedido) {
  const digits = onlyDigits(phone);
  if (!digits) {
    return `<span class="ghost-button compact-button disabled-link">Sem WhatsApp</span>`;
  }

  const phoneNumber = digits.startsWith("55") ? digits : `55${digits}`;
  const message = encodeURIComponent(`Ola, ${name || "cliente"}. Seu pedido de ${formatLiters(pedido.quantidade_solicitada_litros)} esta registrado para ${formatDateTime(pedido.data_hora_solicitada)}.`);
  return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://wa.me/${phoneNumber}?text=${message}">WhatsApp</a>`;
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

function nonNegativeNumber(formData, field, message) {
  const value = Number(String(formData.get(field) || ""));
  if (!Number.isFinite(value) || value < 0) {
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
  return orderStatuses.find(([value]) => value === status)?.[1] || "Status";
}

function formatPaymentMethod(method) {
  return paymentMethods.find(([value]) => value === (method || ""))?.[1] || "Nao informado";
}

function formatPriority(priority) {
  return priorities.find(([value]) => value === priority)?.[1] || "Normal";
}

function getStatusClass(status) {
  if (status === "cancelado") {
    return "inactive";
  }
  if (status === "concluido") {
    return "active";
  }
  if (status === "urgente" || status === "em_entrega") {
    return "warning";
  }
  if (status === "em_rota" || status === "agendado") {
    return "info";
  }
  return "pending";
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

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatLiters(value) {
  return `${Number(value || 0).toLocaleString("pt-BR")} L`;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
      <h2 class="panel-title">Pedidos</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
