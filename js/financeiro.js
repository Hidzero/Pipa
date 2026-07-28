import { enqueueSupabaseMutation, renderConnectionStatus } from "./offline.js";
import { bindPagination, getPageItems, normalizePage, renderPagination } from "./pagination.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const financeState = {
  pagamentos: [],
  recibos: [],
  pedidos: [],
  entregas: [],
  clientes: [],
  locais: [],
  motoristas: [],
  caminhoes: [],
  combustiveis: [],
  despesas: [],
  selectedPaymentId: null,
  paymentPage: 1,
  fuelPage: 1,
  expensePage: 1,
  fuelFormMode: null,
  expenseFormMode: null,
  searchTerm: "",
  statusFilter: "",
  formMode: null,
  selectedSource: "",
  isLoading: false
};

const paymentStatuses = [
  ["pendente", "Pendente"],
  ["parcial", "Parcial"],
  ["pago", "Pago"],
  ["vencido", "Vencido"],
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

export async function renderFinanceiroPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para gerenciar pagamentos.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  renderShell(canWriteFinance());
  bindShellEvents();
  await Promise.all([loadClientes(), loadLocais(), loadPedidos(), loadEntregas(), loadMotoristas(), loadCaminhoes()]);
  await Promise.all([loadPagamentos(), loadRecibos(), loadCombustiveis(), loadDespesas()]);
}

function renderShell(canWrite) {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Financeiro</strong>
          <div id="financeiro-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="dashboard-grid" id="financeiro-metrics">
        ${metricCard("Recebido", "R$ 0,00")}
        ${metricCard("Em aberto", "R$ 0,00")}
        ${metricCard("Combustivel", "R$ 0,00")}
        ${metricCard("Despesas", "R$ 0,00")}
      </section>

      <section class="panel">
        <div class="toolbar orders-toolbar">
          <div class="field search-field">
            <label for="financeiro-search">Buscar</label>
            <input id="financeiro-search" type="search" placeholder="Cliente, entrega, pedido ou status" value="${escapeAttribute(financeState.searchTerm)}">
          </div>
          <div class="field">
            <label for="financeiro-status-filter">Status</label>
            <select id="financeiro-status-filter">
              <option value="">Todos</option>
              ${paymentStatuses.map(([value, label]) => `<option value="${value}" ${value === financeState.statusFilter ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </div>
          ${canWrite ? `<button class="button" type="button" id="new-payment-button">Novo pagamento</button>` : ""}
        </div>
      </section>

      <div id="payment-form-container"></div>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title">Pagamentos</h2>
          <div class="list" id="payments-list">
            <div class="empty-state">Carregando pagamentos...</div>
          </div>
        </div>

        <div class="detail-column" id="payment-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione um pagamento.</div>
          </section>
        </div>
      </section>

      <section class="operations-grid">
        <div class="panel">
          <div class="panel-heading">
            <div>
              <h2 class="panel-title">Combustivel</h2>
              <p class="field-hint" id="fuel-count">Carregando...</p>
            </div>
            ${canWrite ? `<button class="button compact-button" type="button" id="new-fuel-button">Novo abastecimento</button>` : ""}
          </div>
          <div id="fuel-form-container"></div>
          <div class="list" id="fuel-list">
            <div class="empty-state">Carregando abastecimentos...</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-heading">
            <div>
              <h2 class="panel-title">Despesas</h2>
              <p class="field-hint" id="expense-count">Carregando...</p>
            </div>
            ${canWrite ? `<button class="button compact-button" type="button" id="new-expense-button">Nova despesa</button>` : ""}
          </div>
          <div id="expense-form-container"></div>
          <div class="list" id="expense-list">
            <div class="empty-state">Carregando despesas...</div>
          </div>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelector("#financeiro-search")?.addEventListener("input", (event) => {
    financeState.searchTerm = event.target.value;
    financeState.paymentPage = 1;
    renderPaymentsList();
  });

  document.querySelector("#financeiro-status-filter")?.addEventListener("change", (event) => {
    financeState.statusFilter = event.target.value;
    financeState.paymentPage = 1;
    renderPaymentsList();
  });

  document.querySelector("#new-payment-button")?.addEventListener("click", () => {
    financeState.formMode = "new";
    financeState.selectedSource = getSourceOptions()[0]?.[0] || "";
    renderPaymentForm();
  });

  document.querySelector("#new-fuel-button")?.addEventListener("click", () => {
    financeState.fuelFormMode = "new";
    renderFuelForm();
  });

  document.querySelector("#new-expense-button")?.addEventListener("click", () => {
    financeState.expenseFormMode = "new";
    renderExpenseForm();
  });
}

async function loadClientes() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("clientes")
    .select("id, nome, telefone, cpf_cnpj")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    financeState.clientes = [];
    showToast(error.message || "Nao foi possivel carregar clientes.");
    return;
  }

  financeState.clientes = data || [];
}

async function loadLocais() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("locais_entrega")
    .select("id, cliente_id, nome, endereco")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: true });

  if (error) {
    financeState.locais = [];
    showToast(error.message || "Nao foi possivel carregar locais.");
    return;
  }

  financeState.locais = data || [];
}

async function loadPedidos() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("pedidos")
    .select("id, cliente_id, local_entrega_id, quantidade_solicitada_litros, data_hora_solicitada, valor_total, forma_pagamento, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .neq("status", "cancelado")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    financeState.pedidos = [];
    showToast(error.message || "Nao foi possivel carregar pedidos.");
    return;
  }

  financeState.pedidos = data || [];
}

async function loadEntregas() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("entregas")
    .select("id, numero_entrega, pedido_id, cliente_id, local_entrega_id, motorista_id, quantidade_entregue_litros, forma_pagamento, valor_recebido, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    financeState.entregas = [];
    showToast(error.message || "Nao foi possivel carregar entregas.");
    return;
  }

  financeState.entregas = data || [];
}

async function loadMotoristas() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("perfis")
    .select("id, nome, funcao")
    .eq("empresa_id", profile.empresa_id)
    .eq("funcao", "motorista")
    .order("nome", { ascending: true });

  if (error) {
    financeState.motoristas = [];
    return;
  }

  financeState.motoristas = data || [];
}

async function loadCaminhoes() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("caminhoes")
    .select("id, nome, placa, capacidade_litros, status")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    financeState.caminhoes = [];
    showToast(error.message || "Nao foi possivel carregar caminhoes.");
    return;
  }

  financeState.caminhoes = data || [];
}

async function loadPagamentos() {
  const profile = getCurrentProfile();
  financeState.isLoading = true;
  updateCountLabel("Carregando...");

  const { data, error } = await supabaseClient
    .from("pagamentos")
    .select("id, pedido_id, entrega_id, cliente_id, valor_total, valor_pago, valor_pendente, forma_pagamento, data_vencimento, data_pagamento, comprovante_path, status, observacoes, motivo_cancelamento, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false });

  financeState.isLoading = false;

  if (error) {
    showToast(error.message || "Nao foi possivel carregar pagamentos.");
    document.querySelector("#payments-list").innerHTML = `<div class="empty-state">Erro ao carregar pagamentos.</div>`;
    updateCountLabel("Erro");
    return;
  }

  financeState.pagamentos = data || [];

  if (!financeState.selectedPaymentId || !financeState.pagamentos.some((payment) => payment.id === financeState.selectedPaymentId)) {
    financeState.selectedPaymentId = financeState.pagamentos[0]?.id || null;
  }

  renderMetrics();
  renderPaymentsList();
  renderSelectedPayment();
}

async function loadRecibos() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("recibos")
    .select("id, numero_recibo, entrega_id, pagamento_id, pdf_path, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false });

  if (error) {
    financeState.recibos = [];
    showToast(error.message || "Nao foi possivel carregar recibos.");
    return;
  }

  financeState.recibos = data || [];
  renderSelectedPayment();
}

async function loadCombustiveis() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("combustiveis")
    .select("id, caminhao_id, data, quilometragem, litros, valor_litro, valor_total, posto, comprovante_path, status, motivo_cancelamento, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    financeState.combustiveis = [];
    showToast(error.message || "Nao foi possivel carregar abastecimentos.");
    document.querySelector("#fuel-list").innerHTML = `<div class="empty-state">Erro ao carregar abastecimentos.</div>`;
    updateFuelCount("Erro");
    return;
  }

  financeState.combustiveis = data || [];
  renderMetrics();
  renderFuelList();
}

async function loadDespesas() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("despesas")
    .select("id, categoria, data, valor, caminhao_id, descricao, comprovante_path, status, motivo_cancelamento, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    financeState.despesas = [];
    showToast(error.message || "Nao foi possivel carregar despesas.");
    document.querySelector("#expense-list").innerHTML = `<div class="empty-state">Erro ao carregar despesas.</div>`;
    updateExpenseCount("Erro");
    return;
  }

  financeState.despesas = data || [];
  renderMetrics();
  renderExpenseList();
}

function renderMetrics() {
  const container = document.querySelector("#financeiro-metrics");
  if (!container) {
    return;
  }

  const activePayments = financeState.pagamentos.filter((payment) => payment.status !== "cancelado");
  const received = activePayments.reduce((total, payment) => total + Number(payment.valor_pago || 0), 0);
  const pending = activePayments.reduce((total, payment) => total + Number(payment.valor_pendente || 0), 0);
  const fuelTotal = financeState.combustiveis
    .filter((item) => item.status !== "cancelado")
    .reduce((total, item) => total + Number(item.valor_total || 0), 0);
  const expenseTotal = financeState.despesas
    .filter((item) => item.status !== "cancelado")
    .reduce((total, item) => total + Number(item.valor || 0), 0);

  container.innerHTML = `
    ${metricCard("Recebido", formatCurrency(received))}
    ${metricCard("Em aberto", formatCurrency(pending))}
    ${metricCard("Combustivel", formatCurrency(fuelTotal))}
    ${metricCard("Despesas", formatCurrency(expenseTotal))}
  `;
}

function renderPaymentsList() {
  const list = document.querySelector("#payments-list");
  if (!list) {
    return;
  }

  const payments = getFilteredPayments();
  financeState.paymentPage = normalizePage(financeState.paymentPage, payments.length);
  const pagePayments = getPageItems(payments, financeState.paymentPage);
  updateCountLabel(`${payments.length} pagamento${payments.length === 1 ? "" : "s"}`);

  if (financeState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando pagamentos...</div>`;
    return;
  }

  if (!payments.length) {
    list.innerHTML = `<div class="empty-state">Nenhum pagamento encontrado.</div>`;
    return;
  }

  list.innerHTML = pagePayments
    .map((payment) => {
      const cliente = getCliente(payment.cliente_id);
      return `
        <button class="list-item list-button ${payment.id === financeState.selectedPaymentId ? "selected" : ""}" type="button" data-payment-id="${payment.id}">
          <span class="item-main">
            <strong>${escapeHtml(cliente?.nome || "Cliente nao encontrado")}</strong>
            <span>${formatSourceLabel(payment)} · ${formatCurrency(payment.valor_total)}</span>
            <span>Pago ${formatCurrency(payment.valor_pago)} · Aberto ${formatCurrency(payment.valor_pendente)}</span>
          </span>
          <span class="status-pill ${getPaymentStatusClass(payment.status)}">${formatPaymentStatus(payment.status)}</span>
        </button>
      `;
    })
    .join("") + renderPagination(payments.length, financeState.paymentPage);

  list.querySelectorAll("[data-payment-id]").forEach((button) => {
    button.addEventListener("click", () => {
      financeState.selectedPaymentId = button.dataset.paymentId;
      financeState.formMode = null;
      document.querySelector("#payment-form-container").innerHTML = "";
      renderPaymentsList();
      renderSelectedPayment();
    });
  });

  bindPagination(list, (page) => {
    financeState.paymentPage = page;
    renderPaymentsList();
  });
}

function renderSelectedPayment() {
  const detail = document.querySelector("#payment-detail");
  if (!detail) {
    return;
  }

  const payment = getSelectedPayment();
  if (!payment) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione um pagamento.</div>
      </section>
    `;
    return;
  }

  const cliente = getCliente(payment.cliente_id);
  const entrega = getEntrega(payment.entrega_id);
  const pedido = getPedido(payment.pedido_id || entrega?.pedido_id);
  const local = getLocal(entrega?.local_entrega_id || pedido?.local_entrega_id);
  const receipt = getReceipt(payment);
  const canWrite = canWriteFinance();
  const canGenerateReceipt = canWrite && entrega?.id && payment.status !== "cancelado";

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(cliente?.nome || "Pagamento")}</h2>
          <p class="field-hint">${formatSourceLabel(payment)} · ${formatPaymentStatus(payment.status)}</p>
        </div>
        <span class="status-pill ${getPaymentStatusClass(payment.status)}">${formatPaymentStatus(payment.status)}</span>
      </div>

      <dl class="details-list">
        <div><dt>Cliente</dt><dd>${escapeHtml(cliente?.nome || "-")}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(cliente?.telefone || "-")}</dd></div>
        <div><dt>Endereco</dt><dd>${escapeHtml(local?.endereco || "-")}</dd></div>
        <div><dt>Valor total</dt><dd>${formatCurrency(payment.valor_total)}</dd></div>
        <div><dt>Valor pago</dt><dd>${formatCurrency(payment.valor_pago)}</dd></div>
        <div><dt>Valor pendente</dt><dd>${formatCurrency(payment.valor_pendente)}</dd></div>
        <div><dt>Forma de pagamento</dt><dd>${formatPaymentMethod(payment.forma_pagamento)}</dd></div>
        <div><dt>Vencimento</dt><dd>${formatDate(payment.data_vencimento)}</dd></div>
        <div><dt>Pagamento</dt><dd>${formatDate(payment.data_pagamento)}</dd></div>
        <div><dt>Comprovante</dt><dd>${escapeHtml(payment.comprovante_path || "-")}</dd></div>
        <div><dt>Recibo</dt><dd>${receipt ? `Numero ${receipt.numero_recibo || "-"}` : "-"}</dd></div>
        <div><dt>Observacoes</dt><dd>${escapeHtml(payment.observacoes || "-")}</dd></div>
        ${payment.motivo_cancelamento ? `<div><dt>Motivo do cancelamento</dt><dd>${escapeHtml(payment.motivo_cancelamento)}</dd></div>` : ""}
      </dl>

      <div class="button-row">
        ${canWrite ? `<button class="ghost-button compact-button" type="button" id="edit-payment-button">Editar</button>` : ""}
        ${canWrite && payment.status !== "cancelado" ? `<button class="ghost-button compact-button danger-text" type="button" id="cancel-payment-button">Cancelar pagamento</button>` : ""}
        ${canGenerateReceipt ? `<button class="button compact-button" type="button" id="generate-receipt-button">Gerar recibo PDF</button>` : ""}
        ${receipt?.pdf_path ? `<button class="ghost-button compact-button" type="button" id="download-receipt-button">Baixar recibo</button>` : ""}
        ${buildWhatsAppReceiptLink(cliente, payment, entrega, local)}
      </div>
    </section>
  `;

  document.querySelector("#edit-payment-button")?.addEventListener("click", () => {
    financeState.formMode = payment.id;
    financeState.selectedSource = getSourceValue(payment);
    renderPaymentForm();
  });

  document.querySelector("#cancel-payment-button")?.addEventListener("click", async () => {
    await cancelPayment(payment);
  });

  document.querySelector("#generate-receipt-button")?.addEventListener("click", async () => {
    await generateReceipt(payment);
  });

  document.querySelector("#download-receipt-button")?.addEventListener("click", async () => {
    await downloadReceipt(receipt);
  });
}

function renderPaymentForm() {
  const container = document.querySelector("#payment-form-container");
  if (!container) {
    return;
  }

  const isEdit = financeState.formMode && financeState.formMode !== "new";
  const payment = isEdit ? financeState.pagamentos.find((item) => item.id === financeState.formMode) : {};
  const selectedSource = financeState.selectedSource || getSourceValue(payment) || getSourceOptions()[0]?.[0] || "";
  const source = getSourceFromValue(selectedSource);
  const totals = getSourceTotals(source);
  const selectedStatus = payment?.status || derivePaymentStatus(payment?.valor_total ?? totals.valorTotal, payment?.valor_pago ?? totals.valorPago, "");

  container.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <h2 class="panel-title">${isEdit ? "Editar pagamento" : "Novo pagamento"}</h2>
        <button class="ghost-button compact-button" type="button" id="cancel-payment-form">Cancelar</button>
      </div>
      <form class="form" id="payment-form">
        <div class="form-grid">
          ${selectField("source", "Pedido ou entrega", selectedSource, getSourceOptions())}
          ${inputField("valor_total", "Valor total", payment?.valor_total ?? totals.valorTotal, "number", true, "0.01")}
          ${inputField("valor_pago", "Valor pago", payment?.valor_pago ?? totals.valorPago, "number", true, "0.01")}
          ${selectField("forma_pagamento", "Forma de pagamento", payment?.forma_pagamento || totals.formaPagamento || "", paymentMethods)}
          ${inputField("data_vencimento", "Data de vencimento", payment?.data_vencimento || toInputDate(new Date()), "date")}
          ${inputField("data_pagamento", "Data do pagamento", payment?.data_pagamento || "", "date")}
          ${selectField("status", "Status", selectedStatus, paymentStatuses)}
          <div class="field">
            <label for="comprovante">Comprovante</label>
            <input id="comprovante" name="comprovante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
            <p class="field-hint">${payment?.comprovante_path ? "Ja existe comprovante salvo. Envie outro para substituir." : "Opcional."}</p>
          </div>
        </div>
        ${textareaField("observacoes", "Observacoes", payment?.observacoes)}
        <button class="button" type="submit">${isEdit ? "Salvar pagamento" : "Cadastrar pagamento"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-payment-form")?.addEventListener("click", () => {
    financeState.formMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#source")?.addEventListener("change", (event) => {
    financeState.selectedSource = event.target.value;
    const nextSource = getSourceFromValue(financeState.selectedSource);
    const nextTotals = getSourceTotals(nextSource);
    document.querySelector("#valor_total").value = nextTotals.valorTotal;
    document.querySelector("#valor_pago").value = nextTotals.valorPago;
    document.querySelector("#forma_pagamento").value = nextTotals.formaPagamento || "";
    document.querySelector("#status").value = derivePaymentStatus(nextTotals.valorTotal, nextTotals.valorPago, document.querySelector("#data_vencimento")?.value);
  });

  document.querySelector("#payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await savePayment(new FormData(event.currentTarget), payment);
  });
}

async function savePayment(formData, existingPayment = {}) {
  const profile = getCurrentProfile();
  const source = getSourceFromValue(requiredText(formData, "source", "Selecione um pedido ou entrega."));
  if (!source) {
    return;
  }

  const valorTotal = nonNegativeNumber(formData, "valor_total", "Informe um valor total valido.");
  const valorPago = nonNegativeNumber(formData, "valor_pago", "Informe um valor pago valido.");
  if (valorTotal === null || valorPago === null) {
    return;
  }

  const status = String(formData.get("status") || derivePaymentStatus(valorTotal, valorPago, optionalText(formData, "data_vencimento")));
  const basePayload = {
    pedido_id: source.pedidoId,
    entrega_id: source.entregaId,
    cliente_id: source.clienteId,
    valor_total: valorTotal,
    valor_pago: valorPago,
    forma_pagamento: optionalText(formData, "forma_pagamento"),
    data_vencimento: optionalText(formData, "data_vencimento"),
    data_pagamento: optionalText(formData, "data_pagamento"),
    status,
    observacoes: optionalText(formData, "observacoes"),
    updated_by: profile.id
  };

  const isEdit = Boolean(existingPayment?.id);
  if (!navigator.onLine) {
    enqueueSupabaseMutation({
      table: "pagamentos",
      operation: isEdit ? "update" : "insert",
      payload: isEdit ? basePayload : {
        ...basePayload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      },
      match: isEdit ? { id: existingPayment.id } : null,
      label: isEdit ? "Pagamento atualizado" : "Pagamento cadastrado"
    });
    warnOfflineFile(formData, "O comprovante nao foi anexado offline. Envie o arquivo depois que sincronizar.");
    financeState.formMode = null;
    document.querySelector("#payment-form-container").innerHTML = "";
    return;
  }

  const query = isEdit
    ? supabaseClient.from("pagamentos").update(basePayload).eq("id", existingPayment.id).select("id").single()
    : supabaseClient.from("pagamentos").insert({
        ...basePayload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      }).select("id").single();

  const { data, error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o pagamento.");
    return;
  }

  const proofPath = await uploadProof("pagamentos", data.id, formData);
  if (proofPath) {
    const { error: proofError } = await supabaseClient
      .from("pagamentos")
      .update({ comprovante_path: proofPath, updated_by: profile.id })
      .eq("id", data.id);

    if (proofError) {
      showToast("Pagamento salvo, mas nao foi possivel vincular o comprovante.");
    }
  }

  showToast(isEdit ? "Pagamento atualizado." : "Pagamento cadastrado.");
  financeState.formMode = null;
  document.querySelector("#payment-form-container").innerHTML = "";
  await loadPagamentos();
  await loadRecibos();
}

async function uploadProof(entity, recordId, formData) {
  const file = formData.get("comprovante");
  if (!(file instanceof File) || file.size === 0) {
    return "";
  }

  const extension = getFileExtension(file.name, file.type);
  const path = `${getCurrentProfile().empresa_id}/${entity}/${recordId}/comprovante-${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage
    .from("comprovantes")
    .upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });

  if (error) {
    showToast(error.message || "Nao foi possivel enviar o comprovante.");
    return "";
  }

  return path;
}

function warnOfflineFile(formData, message) {
  const file = formData.get("comprovante");
  if (file instanceof File && file.size > 0) {
    showToast(message);
  }
}

async function cancelPayment(payment) {
  const profile = getCurrentProfile();
  const reason = window.prompt("Informe o motivo do cancelamento:");
  if (reason === null) {
    return;
  }

  const { error } = await supabaseClient
    .from("pagamentos")
    .update({
      status: "cancelado",
      cancelado_por: profile.id,
      cancelado_em: new Date().toISOString(),
      motivo_cancelamento: reason.trim() || "Cancelado pelo usuario",
      updated_by: profile.id
    })
    .eq("id", payment.id);

  if (error) {
    showToast(error.message || "Nao foi possivel cancelar o pagamento.");
    return;
  }

  showToast("Pagamento cancelado.");
  await loadPagamentos();
}

function renderFuelForm() {
  const container = document.querySelector("#fuel-form-container");
  if (!container) {
    return;
  }

  const isEdit = financeState.fuelFormMode && financeState.fuelFormMode !== "new";
  const fuel = isEdit ? financeState.combustiveis.find((item) => item.id === financeState.fuelFormMode) : {};

  container.innerHTML = `
    <section class="nested-panel">
      <div class="panel-heading">
        <h3>${isEdit ? "Editar abastecimento" : "Novo abastecimento"}</h3>
        <button class="ghost-button compact-button" type="button" id="cancel-fuel-form">Cancelar</button>
      </div>
      <form class="form" id="fuel-form">
        <div class="form-grid">
          ${selectField("fuel_caminhao_id", "Caminhao", fuel?.caminhao_id || financeState.caminhoes[0]?.id || "", getTruckOptions("Selecione um caminhao"))}
          ${inputField("fuel_data", "Data", fuel?.data || toInputDate(new Date()), "date", true)}
          ${inputField("fuel_quilometragem", "Quilometragem", fuel?.quilometragem, "number", true, "0.1")}
          ${inputField("fuel_litros", "Litros", fuel?.litros, "number", true, "0.001")}
          ${inputField("fuel_valor_litro", "Valor por litro", fuel?.valor_litro, "number", true, "0.001")}
          ${inputField("fuel_posto", "Posto", fuel?.posto)}
          <div class="field">
            <label for="fuel_comprovante">Comprovante</label>
            <input id="fuel_comprovante" name="comprovante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
            <p class="field-hint">${fuel?.comprovante_path ? "Ja existe comprovante salvo. Envie outro para substituir." : "Opcional."}</p>
          </div>
        </div>
        <button class="button" type="submit">${isEdit ? "Salvar abastecimento" : "Cadastrar abastecimento"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-fuel-form")?.addEventListener("click", () => {
    financeState.fuelFormMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#fuel-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveFuel(new FormData(event.currentTarget), fuel);
  });
}

function renderExpenseForm() {
  const container = document.querySelector("#expense-form-container");
  if (!container) {
    return;
  }

  const isEdit = financeState.expenseFormMode && financeState.expenseFormMode !== "new";
  const expense = isEdit ? financeState.despesas.find((item) => item.id === financeState.expenseFormMode) : {};

  container.innerHTML = `
    <section class="nested-panel">
      <div class="panel-heading">
        <h3>${isEdit ? "Editar despesa" : "Nova despesa"}</h3>
        <button class="ghost-button compact-button" type="button" id="cancel-expense-form">Cancelar</button>
      </div>
      <form class="form" id="expense-form">
        <div class="form-grid">
          ${inputField("expense_categoria", "Categoria", expense?.categoria, "text", true)}
          ${inputField("expense_data", "Data", expense?.data || toInputDate(new Date()), "date", true)}
          ${inputField("expense_valor", "Valor", expense?.valor, "number", true, "0.01")}
          ${selectField("expense_caminhao_id", "Caminhao", expense?.caminhao_id || "", getTruckOptions("Sem caminhao vinculado", true))}
          <div class="field">
            <label for="expense_comprovante">Comprovante</label>
            <input id="expense_comprovante" name="comprovante" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
            <p class="field-hint">${expense?.comprovante_path ? "Ja existe comprovante salvo. Envie outro para substituir." : "Opcional."}</p>
          </div>
        </div>
        ${textareaField("expense_descricao", "Descricao", expense?.descricao)}
        <button class="button" type="submit">${isEdit ? "Salvar despesa" : "Cadastrar despesa"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-expense-form")?.addEventListener("click", () => {
    financeState.expenseFormMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#expense-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveExpense(new FormData(event.currentTarget), expense);
  });
}

function renderFuelList() {
  const list = document.querySelector("#fuel-list");
  if (!list) {
    return;
  }

  const items = financeState.combustiveis;
  financeState.fuelPage = normalizePage(financeState.fuelPage, items.length);
  const pageItems = getPageItems(items, financeState.fuelPage);
  updateFuelCount(`${items.length} registro${items.length === 1 ? "" : "s"}`);

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Nenhum abastecimento cadastrado.</div>`;
    return;
  }

  list.innerHTML = pageItems.map((fuel) => {
    const truck = getTruck(fuel.caminhao_id);
    return `
      <article class="list-item">
        <div class="panel-heading compact-heading">
          <div>
            <strong>${escapeHtml(truck ? `${truck.nome} · ${truck.placa}` : "Caminhao")}</strong>
            <span>${formatDate(fuel.data)} · ${formatLiters(fuel.litros)} · ${formatCurrency(fuel.valor_total)}</span>
          </div>
          <span class="status-pill ${getRecordStatusClass(fuel.status)}">${formatRecordStatus(fuel.status)}</span>
        </div>
        <dl class="details-list compact-details">
          <div><dt>Quilometragem</dt><dd>${Number(fuel.quilometragem || 0).toLocaleString("pt-BR")} km</dd></div>
          <div><dt>Valor por litro</dt><dd>${formatCurrency(fuel.valor_litro)}</dd></div>
          <div><dt>Posto</dt><dd>${escapeHtml(fuel.posto || "-")}</dd></div>
          <div><dt>Comprovante</dt><dd>${escapeHtml(fuel.comprovante_path || "-")}</dd></div>
          ${fuel.motivo_cancelamento ? `<div><dt>Motivo</dt><dd>${escapeHtml(fuel.motivo_cancelamento)}</dd></div>` : ""}
        </dl>
        ${canWriteFinance() ? `
          <div class="inline-actions">
            <button class="ghost-button compact-button" type="button" data-fuel-edit="${fuel.id}">Editar</button>
            ${fuel.status !== "cancelado" ? `<button class="ghost-button compact-button danger-text" type="button" data-fuel-cancel="${fuel.id}">Cancelar</button>` : ""}
          </div>
        ` : ""}
      </article>
    `;
  }).join("") + renderPagination(items.length, financeState.fuelPage);

  list.querySelectorAll("[data-fuel-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      financeState.fuelFormMode = button.dataset.fuelEdit;
      renderFuelForm();
    });
  });

  list.querySelectorAll("[data-fuel-cancel]").forEach((button) => {
    button.addEventListener("click", async () => {
      await cancelFuel(button.dataset.fuelCancel);
    });
  });

  bindPagination(list, (page) => {
    financeState.fuelPage = page;
    renderFuelList();
  });
}

function renderExpenseList() {
  const list = document.querySelector("#expense-list");
  if (!list) {
    return;
  }

  const items = financeState.despesas;
  financeState.expensePage = normalizePage(financeState.expensePage, items.length);
  const pageItems = getPageItems(items, financeState.expensePage);
  updateExpenseCount(`${items.length} registro${items.length === 1 ? "" : "s"}`);

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Nenhuma despesa cadastrada.</div>`;
    return;
  }

  list.innerHTML = pageItems.map((expense) => {
    const truck = getTruck(expense.caminhao_id);
    return `
      <article class="list-item">
        <div class="panel-heading compact-heading">
          <div>
            <strong>${escapeHtml(expense.categoria || "Despesa")}</strong>
            <span>${formatDate(expense.data)} · ${formatCurrency(expense.valor)}</span>
          </div>
          <span class="status-pill ${getRecordStatusClass(expense.status)}">${formatRecordStatus(expense.status)}</span>
        </div>
        <dl class="details-list compact-details">
          <div><dt>Caminhao</dt><dd>${escapeHtml(truck ? `${truck.nome} · ${truck.placa}` : "-")}</dd></div>
          <div><dt>Descricao</dt><dd>${escapeHtml(expense.descricao || "-")}</dd></div>
          <div><dt>Comprovante</dt><dd>${escapeHtml(expense.comprovante_path || "-")}</dd></div>
          ${expense.motivo_cancelamento ? `<div><dt>Motivo</dt><dd>${escapeHtml(expense.motivo_cancelamento)}</dd></div>` : ""}
        </dl>
        ${canWriteFinance() ? `
          <div class="inline-actions">
            <button class="ghost-button compact-button" type="button" data-expense-edit="${expense.id}">Editar</button>
            ${expense.status !== "cancelado" ? `<button class="ghost-button compact-button danger-text" type="button" data-expense-cancel="${expense.id}">Cancelar</button>` : ""}
          </div>
        ` : ""}
      </article>
    `;
  }).join("") + renderPagination(items.length, financeState.expensePage);

  list.querySelectorAll("[data-expense-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      financeState.expenseFormMode = button.dataset.expenseEdit;
      renderExpenseForm();
    });
  });

  list.querySelectorAll("[data-expense-cancel]").forEach((button) => {
    button.addEventListener("click", async () => {
      await cancelExpense(button.dataset.expenseCancel);
    });
  });

  bindPagination(list, (page) => {
    financeState.expensePage = page;
    renderExpenseList();
  });
}

async function saveFuel(formData, existingFuel = {}) {
  const profile = getCurrentProfile();
  const quilometragem = nonNegativeNumber(formData, "fuel_quilometragem", "Informe uma quilometragem valida.");
  const litros = positiveNumber(formData, "fuel_litros", "Informe a quantidade de litros.");
  const valorLitro = nonNegativeNumber(formData, "fuel_valor_litro", "Informe um valor por litro valido.");

  if (quilometragem === null || litros === null || valorLitro === null) {
    return;
  }

  const payload = {
    caminhao_id: requiredText(formData, "fuel_caminhao_id", "Selecione um caminhao."),
    data: requiredText(formData, "fuel_data", "Informe a data."),
    quilometragem,
    litros,
    valor_litro: valorLitro,
    posto: optionalText(formData, "fuel_posto"),
    status: "ativo",
    updated_by: profile.id
  };

  if (!payload.caminhao_id || !payload.data) {
    return;
  }

  const isEdit = Boolean(existingFuel?.id);
  if (!navigator.onLine) {
    enqueueSupabaseMutation({
      table: "combustiveis",
      operation: isEdit ? "update" : "insert",
      payload: isEdit ? payload : {
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      },
      match: isEdit ? { id: existingFuel.id } : null,
      label: isEdit ? "Abastecimento atualizado" : "Abastecimento cadastrado"
    });
    warnOfflineFile(formData, "O comprovante nao foi anexado offline. Envie o arquivo depois que sincronizar.");
    financeState.fuelFormMode = null;
    document.querySelector("#fuel-form-container").innerHTML = "";
    return;
  }

  const query = isEdit
    ? supabaseClient.from("combustiveis").update(payload).eq("id", existingFuel.id).select("id").single()
    : supabaseClient.from("combustiveis").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      }).select("id").single();

  const { data, error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o abastecimento.");
    return;
  }

  const proofPath = await uploadProof("combustiveis", data.id, formData);
  if (proofPath) {
    const { error: proofError } = await supabaseClient
      .from("combustiveis")
      .update({ comprovante_path: proofPath, updated_by: profile.id })
      .eq("id", data.id);

    if (proofError) {
      showToast("Abastecimento salvo, mas nao foi possivel vincular o comprovante.");
    }
  }

  showToast(isEdit ? "Abastecimento atualizado." : "Abastecimento cadastrado.");
  financeState.fuelFormMode = null;
  document.querySelector("#fuel-form-container").innerHTML = "";
  await loadCombustiveis();
}

async function saveExpense(formData, existingExpense = {}) {
  const profile = getCurrentProfile();
  const valor = nonNegativeNumber(formData, "expense_valor", "Informe um valor valido.");
  if (valor === null) {
    return;
  }

  const payload = {
    categoria: requiredText(formData, "expense_categoria", "Informe a categoria."),
    data: requiredText(formData, "expense_data", "Informe a data."),
    valor,
    caminhao_id: optionalText(formData, "expense_caminhao_id"),
    descricao: optionalText(formData, "expense_descricao"),
    status: "ativo",
    updated_by: profile.id
  };

  if (!payload.categoria || !payload.data) {
    return;
  }

  const isEdit = Boolean(existingExpense?.id);
  if (!navigator.onLine) {
    enqueueSupabaseMutation({
      table: "despesas",
      operation: isEdit ? "update" : "insert",
      payload: isEdit ? payload : {
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      },
      match: isEdit ? { id: existingExpense.id } : null,
      label: isEdit ? "Despesa atualizada" : "Despesa cadastrada"
    });
    warnOfflineFile(formData, "O comprovante nao foi anexado offline. Envie o arquivo depois que sincronizar.");
    financeState.expenseFormMode = null;
    document.querySelector("#expense-form-container").innerHTML = "";
    return;
  }

  const query = isEdit
    ? supabaseClient.from("despesas").update(payload).eq("id", existingExpense.id).select("id").single()
    : supabaseClient.from("despesas").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      }).select("id").single();

  const { data, error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar a despesa.");
    return;
  }

  const proofPath = await uploadProof("despesas", data.id, formData);
  if (proofPath) {
    const { error: proofError } = await supabaseClient
      .from("despesas")
      .update({ comprovante_path: proofPath, updated_by: profile.id })
      .eq("id", data.id);

    if (proofError) {
      showToast("Despesa salva, mas nao foi possivel vincular o comprovante.");
    }
  }

  showToast(isEdit ? "Despesa atualizada." : "Despesa cadastrada.");
  financeState.expenseFormMode = null;
  document.querySelector("#expense-form-container").innerHTML = "";
  await loadDespesas();
}

async function cancelFuel(id) {
  const fuel = financeState.combustiveis.find((item) => item.id === id);
  if (!fuel) {
    return;
  }

  await cancelRecord("combustiveis", id, "abastecimento");
  await loadCombustiveis();
}

async function cancelExpense(id) {
  const expense = financeState.despesas.find((item) => item.id === id);
  if (!expense) {
    return;
  }

  await cancelRecord("despesas", id, "despesa");
  await loadDespesas();
}

async function cancelRecord(table, id, label) {
  const profile = getCurrentProfile();
  const reason = window.prompt("Informe o motivo do cancelamento:");
  if (reason === null) {
    return;
  }

  const { error } = await supabaseClient
    .from(table)
    .update({
      status: "cancelado",
      cancelado_por: profile.id,
      cancelado_em: new Date().toISOString(),
      motivo_cancelamento: reason.trim() || "Cancelado pelo usuario",
      updated_by: profile.id
    })
    .eq("id", id);

  if (error) {
    showToast(error.message || `Nao foi possivel cancelar ${label}.`);
    return;
  }

  showToast(`${capitalize(label)} cancelado.`);
}

async function generateReceipt(payment) {
  const profile = getCurrentProfile();
  const entrega = getEntrega(payment.entrega_id);
  if (!entrega) {
    showToast("Recibo so pode ser gerado para pagamento vinculado a uma entrega.");
    return;
  }

  const cliente = getCliente(payment.cliente_id);
  const local = getLocal(entrega.local_entrega_id);
  const pedido = getPedido(entrega.pedido_id || payment.pedido_id);
  const receiptData = {
    numeroEntrega: entrega.numero_entrega || entrega.id.slice(0, 8),
    cliente: cliente?.nome || "Cliente",
    endereco: local?.endereco || "-",
    data: formatDate(entrega.created_at),
    quantidade: formatLiters(entrega.quantidade_entregue_litros || pedido?.quantidade_solicitada_litros),
    valorTotal: formatCurrency(payment.valor_total),
    valorPago: formatCurrency(payment.valor_pago),
    formaPagamento: formatPaymentMethod(payment.forma_pagamento),
    motorista: getDriverName(entrega.motorista_id) || "-",
    status: formatPaymentStatus(payment.status)
  };

  const pdfBlob = createReceiptPdf(receiptData);
  const path = `${profile.empresa_id}/recibos/recibo-${payment.id}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabaseClient.storage
    .from("recibos")
    .upload(path, pdfBlob, { upsert: true, contentType: "application/pdf" });

  if (uploadError) {
    showToast(uploadError.message || "Nao foi possivel enviar o recibo.");
    return;
  }

  const { error } = await supabaseClient
    .from("recibos")
    .upsert({
      empresa_id: profile.empresa_id,
      entrega_id: entrega.id,
      pagamento_id: payment.id,
      pdf_path: path,
      status: "gerado",
      created_by: profile.id,
      updated_by: profile.id
    }, { onConflict: "entrega_id" });

  if (error) {
    showToast(error.message || "Nao foi possivel registrar o recibo.");
    return;
  }

  showToast("Recibo gerado.");
  downloadBlob(pdfBlob, `recibo-entrega-${receiptData.numeroEntrega}.pdf`);
  await loadRecibos();
}

async function downloadReceipt(receipt) {
  if (!receipt?.pdf_path) {
    return;
  }

  const { data, error } = await supabaseClient.storage
    .from("recibos")
    .download(receipt.pdf_path);

  if (error) {
    showToast(error.message || "Nao foi possivel baixar o recibo.");
    return;
  }

  downloadBlob(data, `recibo-${receipt.numero_recibo || "entrega"}.pdf`);
}

function getFilteredPayments() {
  const term = normalize(financeState.searchTerm);
  return financeState.pagamentos.filter((payment) => {
    const cliente = getCliente(payment.cliente_id);
    const entrega = getEntrega(payment.entrega_id);
    const pedido = getPedido(payment.pedido_id || entrega?.pedido_id);
    const local = getLocal(entrega?.local_entrega_id || pedido?.local_entrega_id);
    const matchesStatus = !financeState.statusFilter || payment.status === financeState.statusFilter;
    const matchesTerm = !term || [
      cliente?.nome,
      cliente?.telefone,
      local?.endereco,
      payment.status,
      payment.pedido_id,
      payment.entrega_id,
      entrega?.numero_entrega
    ].some((value) => normalize(value).includes(term));

    return matchesStatus && matchesTerm;
  });
}

function getSourceOptions() {
  const deliveryOptions = financeState.entregas.map((entrega) => {
    const cliente = getCliente(entrega.cliente_id);
    return [`entrega:${entrega.id}`, `Entrega #${entrega.numero_entrega || entrega.id.slice(0, 8)} - ${cliente?.nome || "Cliente"} - ${formatCurrency(getSourceTotals({ entrega }).valorTotal)}`];
  });

  const orderOptions = financeState.pedidos
    .filter((pedido) => !financeState.entregas.some((entrega) => entrega.pedido_id === pedido.id))
    .map((pedido) => {
      const cliente = getCliente(pedido.cliente_id);
      return [`pedido:${pedido.id}`, `Pedido ${formatDateTime(pedido.data_hora_solicitada || pedido.created_at)} - ${cliente?.nome || "Cliente"} - ${formatCurrency(pedido.valor_total)}`];
    });

  return [...deliveryOptions, ...orderOptions];
}

function getSourceFromValue(value) {
  const [type, id] = String(value || "").split(":");
  if (type === "entrega") {
    const entrega = getEntrega(id);
    if (!entrega) {
      return null;
    }
    return {
      type,
      entrega,
      pedidoId: entrega.pedido_id,
      entregaId: entrega.id,
      clienteId: entrega.cliente_id
    };
  }

  if (type === "pedido") {
    const pedido = getPedido(id);
    if (!pedido) {
      return null;
    }
    return {
      type,
      pedido,
      pedidoId: pedido.id,
      entregaId: null,
      clienteId: pedido.cliente_id
    };
  }

  return null;
}

function getSourceTotals(source) {
  const entrega = source?.entrega;
  const pedido = source?.pedido || getPedido(entrega?.pedido_id);
  const valorTotal = Number(pedido?.valor_total ?? entrega?.valor_recebido ?? 0);
  const valorPago = Number(entrega?.valor_recebido ?? 0);
  const formaPagamento = entrega?.forma_pagamento || pedido?.forma_pagamento || "";
  return { valorTotal, valorPago, formaPagamento };
}

function getSourceValue(payment = {}) {
  if (payment?.entrega_id) {
    return `entrega:${payment.entrega_id}`;
  }
  if (payment?.pedido_id) {
    return `pedido:${payment.pedido_id}`;
  }
  return "";
}

function getSelectedPayment() {
  return financeState.pagamentos.find((payment) => payment.id === financeState.selectedPaymentId) || null;
}

function getCliente(id) {
  return financeState.clientes.find((cliente) => cliente.id === id) || null;
}

function getLocal(id) {
  return financeState.locais.find((local) => local.id === id) || null;
}

function getPedido(id) {
  return financeState.pedidos.find((pedido) => pedido.id === id) || null;
}

function getEntrega(id) {
  return financeState.entregas.find((entrega) => entrega.id === id) || null;
}

function getDriverName(id) {
  return financeState.motoristas.find((driver) => driver.id === id)?.nome || "";
}

function getTruck(id) {
  return financeState.caminhoes.find((truck) => truck.id === id) || null;
}

function getTruckOptions(emptyLabel, includeEmpty = false) {
  const truckOptions = financeState.caminhoes.map((truck) => [truck.id, `${truck.nome} - ${truck.placa}`]);
  return includeEmpty ? [["", emptyLabel], ...truckOptions] : truckOptions;
}

function getReceipt(payment) {
  return financeState.recibos.find((receipt) => receipt.pagamento_id === payment.id || receipt.entrega_id === payment.entrega_id) || null;
}

function canWriteFinance() {
  const role = getCurrentProfile()?.funcao;
  return role === "administrador" || role === "financeiro";
}

function updateCountLabel(text) {
  const label = document.querySelector("#financeiro-count");
  if (label) {
    label.textContent = text;
  }
}

function updateFuelCount(text) {
  const label = document.querySelector("#fuel-count");
  if (label) {
    label.textContent = text;
  }
}

function updateExpenseCount(text) {
  const label = document.querySelector("#expense-count");
  if (label) {
    label.textContent = text;
  }
}

function metricCard(label, value) {
  return `
    <article class="card metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
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

function buildWhatsAppReceiptLink(cliente, payment, entrega, local) {
  const digits = onlyDigits(cliente?.telefone);
  if (!digits) {
    return `<span class="ghost-button compact-button disabled-link">Sem WhatsApp</span>`;
  }

  const phoneNumber = digits.startsWith("55") ? digits : `55${digits}`;
  const message = encodeURIComponent(
    `Ola, ${cliente?.nome || "cliente"}. Recibo da entrega ${entrega?.numero_entrega || "-"}: ${formatLiters(entrega?.quantidade_entregue_litros)}, ${formatCurrency(payment.valor_total)}, pagamento ${formatPaymentStatus(payment.status)}. Endereco: ${local?.endereco || "-"}`
  );
  return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://wa.me/${phoneNumber}?text=${message}">WhatsApp recibo</a>`;
}

function createReceiptPdf(data) {
  const lines = [
    "RECIBO DE ENTREGA DE AGUA",
    "",
    `Entrega: ${data.numeroEntrega}`,
    `Cliente: ${data.cliente}`,
    `Endereco: ${data.endereco}`,
    `Data: ${data.data}`,
    `Quantidade: ${data.quantidade}`,
    `Valor total: ${data.valorTotal}`,
    `Valor pago: ${data.valorPago}`,
    `Forma de pagamento: ${data.formaPagamento}`,
    `Motorista: ${data.motorista}`,
    `Status do pagamento: ${data.status}`,
    "",
    "Documento gerado pelo app Pipa Entregas."
  ];

  const content = [
    "BT",
    "/F1 18 Tf",
    "56 780 Td",
    `(${toPdfText(lines[0])}) Tj`,
    "/F1 11 Tf",
    ...lines.slice(1).flatMap((line) => ["0 -24 Td", `(${toPdfText(line)}) Tj`]),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function nonNegativeNumber(formData, field, message) {
  const value = Number(String(formData.get(field) || "").replace(",", "."));
  if (!Number.isFinite(value) || value < 0) {
    showToast(message);
    return null;
  }
  return value;
}

function positiveNumber(formData, field, message) {
  const value = Number(String(formData.get(field) || "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) {
    showToast(message);
    return null;
  }
  return value;
}

function derivePaymentStatus(valorTotal, valorPago, dueDate) {
  const total = Number(valorTotal || 0);
  const paid = Number(valorPago || 0);
  if (total > 0 && paid >= total) {
    return "pago";
  }
  if (paid > 0) {
    return "parcial";
  }
  if (dueDate && new Date(`${dueDate}T23:59:59`) < new Date()) {
    return "vencido";
  }
  return "pendente";
}

function getFileExtension(name, type) {
  const fromName = String(name || "").split(".").pop();
  if (fromName && fromName !== name) {
    return fromName.toLowerCase();
  }
  if (type === "application/pdf") {
    return "pdf";
  }
  if (type === "image/png") {
    return "png";
  }
  if (type === "image/webp") {
    return "webp";
  }
  return "jpg";
}

function formatSourceLabel(payment) {
  const entrega = getEntrega(payment.entrega_id);
  if (entrega) {
    return `Entrega #${entrega.numero_entrega || entrega.id.slice(0, 8)}`;
  }
  if (payment.pedido_id) {
    return `Pedido ${payment.pedido_id.slice(0, 8)}`;
  }
  return "Origem nao informada";
}

function formatPaymentStatus(status) {
  const found = paymentStatuses.find(([value]) => value === status);
  return found?.[1] || "Pendente";
}

function getPaymentStatusClass(status) {
  if (status === "pago") {
    return "active";
  }
  if (status === "parcial") {
    return "info";
  }
  if (status === "pendente") {
    return "pending";
  }
  if (status === "vencido") {
    return "warning";
  }
  return "inactive";
}

function formatRecordStatus(status) {
  if (status === "ativo") {
    return "Ativo";
  }
  if (status === "cancelado") {
    return "Cancelado";
  }
  return "Inativo";
}

function getRecordStatusClass(status) {
  if (status === "ativo") {
    return "active";
  }
  if (status === "cancelado") {
    return "inactive";
  }
  return "warning";
}

function formatPaymentMethod(method) {
  return paymentMethods.find(([value]) => value === method)?.[1] || "Nao informado";
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

function formatDate(value) {
  if (!value) {
    return "-";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
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

function toInputDate(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function capitalize(value) {
  const text = String(value || "");
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function toPdfText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function renderUnavailable(message) {
  app.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Financeiro indisponivel</h2>
      <div class="empty-state">${escapeHtml(message)}</div>
    </section>
  `;
}
