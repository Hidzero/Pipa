import { renderConnectionStatus } from "./offline.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const reportState = {
  startDate: firstDayOfMonth(new Date()),
  endDate: toInputDate(new Date()),
  clienteId: "",
  caminhaoId: "",
  motoristaId: "",
  data: null,
  references: {
    clientes: [],
    caminhoes: [],
    motoristas: []
  },
  isLoading: false
};

export async function renderRelatoriosPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para carregar relatorios.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  await loadReportReferences(profile);
  renderShell();
  bindReportEvents();
  await loadReports();
}

function renderShell() {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Relatorios</strong>
          <div id="reports-count">Periodo atual</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar report-toolbar">
          <div class="field">
            <label for="report-start">Inicio</label>
            <input id="report-start" type="date" value="${reportState.startDate}">
          </div>
          <div class="field">
            <label for="report-end">Fim</label>
            <input id="report-end" type="date" value="${reportState.endDate}">
          </div>
          ${selectField("report-client", "Cliente", reportState.clienteId, [["", "Todos"], ...reportState.references.clientes.map((cliente) => [cliente.id, cliente.nome])])}
          ${selectField("report-truck", "Caminhao", reportState.caminhaoId, [["", "Todos"], ...reportState.references.caminhoes.map((truck) => [truck.id, `${truck.nome} - ${truck.placa}`])])}
          ${selectField("report-driver", "Motorista", reportState.motoristaId, [["", "Todos"], ...reportState.references.motoristas.map((driver) => [driver.id, driver.nome])])}
          <button class="button" type="button" id="apply-report-filter">Aplicar filtro</button>
          <button class="ghost-button" type="button" id="export-report-csv">Exportar CSV</button>
        </div>
      </section>

      <section class="dashboard-grid" id="report-metrics">
        ${metricCard("Entregas", "...")}
        ${metricCard("Litros", "...")}
        ${metricCard("Faturamento", "...")}
        ${metricCard("Em aberto", "...")}
        ${metricCard("Combustivel", "...")}
        ${metricCard("Despesas", "...")}
        ${metricCard("Resultado", "...")}
        ${metricCard("Ticket medio", "...")}
      </section>

      <section class="report-grid">
        <section class="panel">
          <h2 class="panel-title">Clientes que mais compram</h2>
          <div id="top-clients-report" class="empty-state">Carregando...</div>
        </section>

        <section class="panel">
          <h2 class="panel-title">Entregas por status</h2>
          <div id="delivery-status-report" class="empty-state">Carregando...</div>
        </section>

        <section class="panel">
          <h2 class="panel-title">Gastos por categoria</h2>
          <div id="expense-category-report" class="empty-state">Carregando...</div>
        </section>

        <section class="panel">
          <h2 class="panel-title">Combustivel por caminhao</h2>
          <div id="fuel-truck-report" class="empty-state">Carregando...</div>
        </section>

        <section class="panel">
          <h2 class="panel-title">Entregas por motorista</h2>
          <div id="driver-deliveries-report" class="empty-state">Carregando...</div>
        </section>

        <section class="panel">
          <h2 class="panel-title">Resultado por caminhao</h2>
          <div id="truck-result-report" class="empty-state">Carregando...</div>
        </section>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindReportEvents() {
  document.querySelector("#apply-report-filter")?.addEventListener("click", async () => {
    const start = document.querySelector("#report-start")?.value;
    const end = document.querySelector("#report-end")?.value;
    const clienteId = document.querySelector("#report-client")?.value || "";
    const caminhaoId = document.querySelector("#report-truck")?.value || "";
    const motoristaId = document.querySelector("#report-driver")?.value || "";

    if (!start || !end) {
      showToast("Informe inicio e fim do periodo.");
      return;
    }

    if (new Date(`${end}T00:00:00`) < new Date(`${start}T00:00:00`)) {
      showToast("A data final nao pode ser anterior ao inicio.");
      return;
    }

    reportState.startDate = start;
    reportState.endDate = end;
    reportState.clienteId = clienteId;
    reportState.caminhaoId = caminhaoId;
    reportState.motoristaId = motoristaId;
    await loadReports();
  });

  document.querySelector("#export-report-csv")?.addEventListener("click", () => {
    exportReportsCsv();
  });
}

async function loadReportReferences(profile) {
  const [clientes, caminhoes, motoristas] = await Promise.all([
    safeReferenceLoad(loadClientes(profile), "Clientes indisponiveis nos filtros."),
    safeReferenceLoad(loadCaminhoes(profile), "Caminhoes indisponiveis nos filtros."),
    safeReferenceLoad(loadMotoristas(profile), "Motoristas indisponiveis nos filtros.")
  ]);

  reportState.references = { clientes, caminhoes, motoristas };
}

async function safeReferenceLoad(promise, message) {
  try {
    return await promise;
  } catch {
    showToast(message);
    return [];
  }
}

async function loadReports() {
  const profile = getCurrentProfile();
  reportState.isLoading = true;
  updateCountLabel("Carregando...");

  try {
    const start = new Date(`${reportState.startDate}T00:00:00`);
    const endExclusive = addDays(new Date(`${reportState.endDate}T00:00:00`), 1);
    const [entregas, pedidos, pagamentos, combustiveis, despesas] = await Promise.all([
      loadEntregas(profile, start, endExclusive),
      loadPedidos(profile, start, endExclusive),
      loadPagamentos(profile),
      loadCombustiveis(profile),
      loadDespesas(profile)
    ]);

    const rawData = {
      entregas,
      pedidos,
      pagamentos,
      combustiveis: filterDateRows(combustiveis, "data"),
      despesas: filterDateRows(despesas, "data"),
      clientes: reportState.references.clientes,
      caminhoes: reportState.references.caminhoes,
      motoristas: reportState.references.motoristas
    };

    reportState.data = applyReportFilters(rawData);
    renderReportData(reportState.data);
    updateCountLabel(`${formatDate(reportState.startDate)} ate ${formatDate(reportState.endDate)}${getFilterSummary()}`);
  } catch (error) {
    showToast(error.message || "Nao foi possivel carregar relatorios.");
    renderReportError();
  } finally {
    reportState.isLoading = false;
  }
}

async function loadEntregas(profile, start, endExclusive) {
  const query = supabaseClient
    .from("entregas")
    .select("id, numero_entrega, pedido_id, cliente_id, caminhao_id, motorista_id, quantidade_entregue_litros, valor_recebido, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .gte("created_at", start.toISOString())
    .lt("created_at", endExclusive.toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);

  return fetchRows(query, "Nao foi possivel carregar entregas.");
}

async function loadPedidos(profile, start, endExclusive) {
  const query = supabaseClient
    .from("pedidos")
    .select("id, cliente_id, quantidade_solicitada_litros, valor_total, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .gte("created_at", start.toISOString())
    .lt("created_at", endExclusive.toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);

  return fetchRows(query, "Nao foi possivel carregar pedidos.");
}

async function loadPagamentos(profile) {
  const query = supabaseClient
    .from("pagamentos")
    .select("id, pedido_id, entrega_id, cliente_id, valor_total, valor_pago, valor_pendente, data_pagamento, data_vencimento, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false })
    .limit(2000);

  return fetchRows(query, "Nao foi possivel carregar pagamentos.");
}

async function loadCombustiveis(profile) {
  const query = supabaseClient
    .from("combustiveis")
    .select("id, caminhao_id, data, litros, valor_total, status")
    .eq("empresa_id", profile.empresa_id)
    .order("data", { ascending: false })
    .limit(2000);

  return fetchRows(query, "Nao foi possivel carregar combustivel.");
}

async function loadDespesas(profile) {
  const query = supabaseClient
    .from("despesas")
    .select("id, categoria, data, valor, caminhao_id, status")
    .eq("empresa_id", profile.empresa_id)
    .order("data", { ascending: false })
    .limit(2000);

  return fetchRows(query, "Nao foi possivel carregar despesas.");
}

async function loadClientes(profile) {
  const query = supabaseClient
    .from("clientes")
    .select("id, nome, telefone")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true })
    .limit(1000);

  return fetchRows(query, "Nao foi possivel carregar clientes.");
}

async function loadCaminhoes(profile) {
  const query = supabaseClient
    .from("caminhoes")
    .select("id, nome, placa")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  return fetchRows(query, "Nao foi possivel carregar caminhoes.");
}

async function loadMotoristas(profile) {
  const query = supabaseClient
    .from("perfis")
    .select("id, nome")
    .eq("empresa_id", profile.empresa_id)
    .eq("funcao", "motorista")
    .order("nome", { ascending: true })
    .limit(1000);

  return fetchRows(query, "Nao foi possivel carregar motoristas.");
}

async function fetchRows(query, message) {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || message);
  }
  return data || [];
}

function renderReportData(data) {
  const metrics = calculateMetrics(data);
  const metricsContainer = document.querySelector("#report-metrics");
  if (metricsContainer) {
    metricsContainer.innerHTML = `
      ${metricCard("Entregas", String(metrics.deliveriesCount))}
      ${metricCard("Litros", formatLiters(metrics.deliveredLiters))}
      ${metricCard("Faturamento", formatCurrency(metrics.revenue))}
      ${metricCard("Em aberto", formatCurrency(metrics.openAmount))}
      ${metricCard("Combustivel", formatCurrency(metrics.fuelCost))}
      ${metricCard("Despesas", formatCurrency(metrics.expenseCost))}
      ${metricCard("Resultado", formatCurrency(metrics.estimatedResult))}
      ${metricCard("Ticket medio", formatCurrency(metrics.averageTicket))}
    `;
  }

  renderTopClients(data);
  renderDeliveryStatus(data);
  renderExpenseCategories(data);
  renderFuelByTruck(data);
  renderDeliveriesByDriver(data);
  renderTruckResult(data);
}

function applyReportFilters(data) {
  const entregas = data.entregas.filter((entrega) =>
    matchesClient(entrega.cliente_id) &&
    matchesTruck(entrega.caminhao_id) &&
    matchesDriver(entrega.motorista_id)
  );

  const entregaIds = new Set(entregas.map((entrega) => entrega.id));
  const pedidoIdsFromEntregas = new Set(entregas.map((entrega) => entrega.pedido_id).filter(Boolean));

  const pedidos = data.pedidos.filter((pedido) => {
    if (reportState.caminhaoId || reportState.motoristaId) {
      return pedidoIdsFromEntregas.has(pedido.id);
    }
    return matchesClient(pedido.cliente_id);
  });

  const pagamentos = data.pagamentos.filter((payment) => {
    const entrega = data.entregas.find((item) => item.id === payment.entrega_id);
    const clienteOk = matchesClient(payment.cliente_id);
    const truckOk = !reportState.caminhaoId || (entrega && entrega.caminhao_id === reportState.caminhaoId);
    const driverOk = !reportState.motoristaId || (entrega && entrega.motorista_id === reportState.motoristaId);
    const deliveryOk = !payment.entrega_id || entregaIds.has(payment.entrega_id) || (!reportState.caminhaoId && !reportState.motoristaId);
    return clienteOk && truckOk && driverOk && deliveryOk;
  });

  const combustiveis = data.combustiveis.filter((fuel) => matchesTruck(fuel.caminhao_id));
  const despesas = data.despesas.filter((expense) => matchesTruck(expense.caminhao_id));

  return {
    ...data,
    entregas,
    pedidos,
    pagamentos,
    combustiveis,
    despesas
  };
}

function calculateMetrics(data) {
  const activePayments = data.pagamentos.filter((payment) => payment.status !== "cancelado");
  const paymentsInPeriod = activePayments.filter((payment) => isDateInPeriod(payment.data_pagamento || payment.created_at));
  const openPayments = activePayments.filter((payment) => !["pago", "cancelado"].includes(payment.status));
  const activeFuel = data.combustiveis.filter((item) => item.status !== "cancelado");
  const activeExpenses = data.despesas.filter((item) => item.status !== "cancelado");
  const completedDeliveries = data.entregas.filter((entrega) => entrega.status !== "cancelado");

  const revenue = paymentsInPeriod.reduce((total, payment) => total + Number(payment.valor_pago || 0), 0);
  const deliveredRevenue = completedDeliveries.reduce((total, entrega) => total + Number(entrega.valor_recebido || 0), 0);
  const deliveredLiters = completedDeliveries.reduce((total, entrega) => total + Number(entrega.quantidade_entregue_litros || 0), 0);
  const fuelCost = activeFuel.reduce((total, item) => total + Number(item.valor_total || 0), 0);
  const expenseCost = activeExpenses.reduce((total, item) => total + Number(item.valor || 0), 0);
  const openAmount = openPayments.reduce((total, payment) => total + Number(payment.valor_pendente || 0), 0);

  return {
    deliveriesCount: completedDeliveries.length,
    deliveredLiters,
    revenue: revenue || deliveredRevenue,
    openAmount,
    fuelCost,
    expenseCost,
    estimatedResult: (revenue || deliveredRevenue) - fuelCost - expenseCost,
    averageTicket: completedDeliveries.length ? (revenue || deliveredRevenue) / completedDeliveries.length : 0
  };
}

function renderTopClients(data) {
  const container = document.querySelector("#top-clients-report");
  if (!container) {
    return;
  }

  const rows = data.entregas
    .filter((entrega) => entrega.status !== "cancelado")
    .reduce((acc, entrega) => {
      const current = acc.get(entrega.cliente_id) || { cliente_id: entrega.cliente_id, entregas: 0, litros: 0, valor: 0 };
      current.entregas += 1;
      current.litros += Number(entrega.quantidade_entregue_litros || 0);
      current.valor += Number(entrega.valor_recebido || 0);
      acc.set(entrega.cliente_id, current);
      return acc;
    }, new Map());

  const list = [...rows.values()]
    .sort((a, b) => b.valor - a.valor || b.litros - a.litros)
    .slice(0, 5);

  container.className = list.length ? "report-list" : "empty-state";
  container.innerHTML = list.length
    ? list.map((row) => reportRow(getClienteName(data, row.cliente_id), `${row.entregas} entrega${row.entregas === 1 ? "" : "s"} · ${formatLiters(row.litros)}`, formatCurrency(row.valor))).join("")
    : "Nenhuma entrega concluida no periodo.";
}

function renderDeliveryStatus(data) {
  const container = document.querySelector("#delivery-status-report");
  if (!container) {
    return;
  }

  const rows = data.pedidos.reduce((acc, pedido) => {
    const current = acc.get(pedido.status) || { status: pedido.status, count: 0, value: 0, liters: 0 };
    current.count += 1;
    current.value += Number(pedido.valor_total || 0);
    current.liters += Number(pedido.quantidade_solicitada_litros || 0);
    acc.set(pedido.status, current);
    return acc;
  }, new Map());

  const list = [...rows.values()].sort((a, b) => b.count - a.count);
  container.className = list.length ? "report-list" : "empty-state";
  container.innerHTML = list.length
    ? list.map((row) => reportRow(formatOrderStatus(row.status), `${row.count} pedido${row.count === 1 ? "" : "s"} · ${formatLiters(row.liters)}`, formatCurrency(row.value))).join("")
    : "Nenhum pedido no periodo.";
}

function renderExpenseCategories(data) {
  const container = document.querySelector("#expense-category-report");
  if (!container) {
    return;
  }

  const rows = data.despesas
    .filter((expense) => expense.status !== "cancelado")
    .reduce((acc, expense) => {
      const category = expense.categoria || "Sem categoria";
      const current = acc.get(category) || { category, count: 0, value: 0 };
      current.count += 1;
      current.value += Number(expense.valor || 0);
      acc.set(category, current);
      return acc;
    }, new Map());

  const list = [...rows.values()].sort((a, b) => b.value - a.value).slice(0, 6);
  container.className = list.length ? "report-list" : "empty-state";
  container.innerHTML = list.length
    ? list.map((row) => reportRow(row.category, `${row.count} registro${row.count === 1 ? "" : "s"}`, formatCurrency(row.value))).join("")
    : "Nenhuma despesa no periodo.";
}

function renderFuelByTruck(data) {
  const container = document.querySelector("#fuel-truck-report");
  if (!container) {
    return;
  }

  const rows = data.combustiveis
    .filter((fuel) => fuel.status !== "cancelado")
    .reduce((acc, fuel) => {
      const current = acc.get(fuel.caminhao_id) || { caminhao_id: fuel.caminhao_id, count: 0, liters: 0, value: 0 };
      current.count += 1;
      current.liters += Number(fuel.litros || 0);
      current.value += Number(fuel.valor_total || 0);
      acc.set(fuel.caminhao_id, current);
      return acc;
    }, new Map());

  const list = [...rows.values()].sort((a, b) => b.value - a.value).slice(0, 6);
  container.className = list.length ? "report-list" : "empty-state";
  container.innerHTML = list.length
    ? list.map((row) => reportRow(getTruckName(data, row.caminhao_id), `${row.count} abastecimento${row.count === 1 ? "" : "s"} · ${formatLiters(row.liters)}`, formatCurrency(row.value))).join("")
    : "Nenhum abastecimento no periodo.";
}

function renderDeliveriesByDriver(data) {
  const container = document.querySelector("#driver-deliveries-report");
  if (!container) {
    return;
  }

  const rows = data.entregas
    .filter((delivery) => delivery.status !== "cancelado")
    .reduce((acc, delivery) => {
      const current = acc.get(delivery.motorista_id) || { motorista_id: delivery.motorista_id, count: 0, liters: 0, value: 0 };
      current.count += 1;
      current.liters += Number(delivery.quantidade_entregue_litros || 0);
      current.value += Number(delivery.valor_recebido || 0);
      acc.set(delivery.motorista_id, current);
      return acc;
    }, new Map());

  const list = [...rows.values()].sort((a, b) => b.count - a.count || b.value - a.value).slice(0, 8);
  container.className = list.length ? "report-list" : "empty-state";
  container.innerHTML = list.length
    ? list.map((row) => reportRow(getDriverName(data, row.motorista_id), `${row.count} entrega${row.count === 1 ? "" : "s"} · ${formatLiters(row.liters)}`, formatCurrency(row.value))).join("")
    : "Nenhuma entrega por motorista no periodo.";
}

function renderTruckResult(data) {
  const container = document.querySelector("#truck-result-report");
  if (!container) {
    return;
  }

  const truckIds = new Set([
    ...data.entregas.map((delivery) => delivery.caminhao_id),
    ...data.combustiveis.map((fuel) => fuel.caminhao_id),
    ...data.despesas.map((expense) => expense.caminhao_id)
  ].filter(Boolean));

  const list = [...truckIds].map((truckId) => {
    const revenue = data.entregas
      .filter((delivery) => delivery.caminhao_id === truckId && delivery.status !== "cancelado")
      .reduce((total, delivery) => total + Number(delivery.valor_recebido || 0), 0);
    const fuel = data.combustiveis
      .filter((item) => item.caminhao_id === truckId && item.status !== "cancelado")
      .reduce((total, item) => total + Number(item.valor_total || 0), 0);
    const expenses = data.despesas
      .filter((expense) => expense.caminhao_id === truckId && expense.status !== "cancelado")
      .reduce((total, expense) => total + Number(expense.valor || 0), 0);
    return { truckId, revenue, fuel, expenses, result: revenue - fuel - expenses };
  }).sort((a, b) => b.result - a.result).slice(0, 8);

  container.className = list.length ? "report-list" : "empty-state";
  container.innerHTML = list.length
    ? list.map((row) => reportRow(getTruckName(data, row.truckId), `Receita ${formatCurrency(row.revenue)} · Gastos ${formatCurrency(row.fuel + row.expenses)}`, formatCurrency(row.result))).join("")
    : "Nenhum resultado por caminhao no periodo.";
}

function reportRow(title, subtitle, value) {
  return `
    <article class="report-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function filterDateRows(rows, field) {
  return rows.filter((row) => isDateInPeriod(row[field]));
}

function matchesClient(clienteId) {
  return !reportState.clienteId || clienteId === reportState.clienteId;
}

function matchesTruck(caminhaoId) {
  return !reportState.caminhaoId || caminhaoId === reportState.caminhaoId;
}

function matchesDriver(motoristaId) {
  return !reportState.motoristaId || motoristaId === reportState.motoristaId;
}

function isDateInPeriod(value) {
  if (!value) {
    return false;
  }

  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  const start = new Date(`${reportState.startDate}T00:00:00`);
  const endExclusive = addDays(new Date(`${reportState.endDate}T00:00:00`), 1);
  return date >= start && date < endExclusive;
}

function renderReportError() {
  document.querySelector("#report-metrics").innerHTML = `
    ${metricCard("Entregas", "-")}
    ${metricCard("Litros", "-")}
    ${metricCard("Faturamento", "-")}
    ${metricCard("Em aberto", "-")}
  `;
  ["#top-clients-report", "#delivery-status-report", "#expense-category-report", "#fuel-truck-report", "#driver-deliveries-report", "#truck-result-report"].forEach((selector) => {
    const container = document.querySelector(selector);
    if (container) {
      container.className = "empty-state";
      container.textContent = "Nao foi possivel carregar este relatorio.";
    }
  });
}

function updateCountLabel(text) {
  const label = document.querySelector("#reports-count");
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

function selectField(name, label, selectedValue, options) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}">
        ${options.map(([value, labelText]) => `<option value="${escapeAttribute(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(labelText)}</option>`).join("")}
      </select>
    </div>
  `;
}

function getClienteName(data, id) {
  return data.clientes.find((cliente) => cliente.id === id)?.nome || "Cliente nao encontrado";
}

function getTruckName(data, id) {
  const truck = data.caminhoes.find((item) => item.id === id);
  return truck ? `${truck.nome} · ${truck.placa}` : "Caminhao nao encontrado";
}

function getDriverName(data, id) {
  return data.motoristas.find((driver) => driver.id === id)?.nome || "Motorista nao informado";
}

function getFilterSummary() {
  const filters = [
    reportState.clienteId ? "cliente" : "",
    reportState.caminhaoId ? "caminhao" : "",
    reportState.motoristaId ? "motorista" : ""
  ].filter(Boolean);

  return filters.length ? ` · filtro: ${filters.join(", ")}` : "";
}

function exportReportsCsv() {
  if (!reportState.data) {
    showToast("Carregue o relatorio antes de exportar.");
    return;
  }

  const rows = buildCsvRows(reportState.data);
  if (!rows.length) {
    showToast("Nao ha dados para exportar.");
    return;
  }

  const header = ["tipo", "data", "cliente", "caminhao", "motorista", "status", "litros", "valor", "observacao"];
  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-pipa-${reportState.startDate}-a-${reportState.endDate}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCsvRows(data) {
  const deliveryRows = data.entregas.map((delivery) => [
    "entrega",
    formatDate(delivery.created_at),
    getClienteName(data, delivery.cliente_id),
    getTruckName(data, delivery.caminhao_id),
    getDriverName(data, delivery.motorista_id),
    formatOrderStatus(delivery.status),
    Number(delivery.quantidade_entregue_litros || 0),
    Number(delivery.valor_recebido || 0),
    delivery.numero_entrega || delivery.id
  ]);

  const paymentRows = data.pagamentos
    .filter((payment) => isDateInPeriod(payment.data_pagamento || payment.created_at))
    .map((payment) => [
      "pagamento",
      formatDate(payment.data_pagamento || payment.created_at),
      getClienteName(data, payment.cliente_id),
      "",
      "",
      payment.status || "",
      "",
      Number(payment.valor_pago || 0),
      payment.valor_pendente ? `pendente ${formatCurrency(payment.valor_pendente)}` : ""
    ]);

  const fuelRows = data.combustiveis.map((fuel) => [
    "combustivel",
    formatDate(fuel.data),
    "",
    getTruckName(data, fuel.caminhao_id),
    "",
    fuel.status || "",
    Number(fuel.litros || 0),
    Number(fuel.valor_total || 0),
    ""
  ]);

  const expenseRows = data.despesas.map((expense) => [
    "despesa",
    formatDate(expense.data),
    "",
    expense.caminhao_id ? getTruckName(data, expense.caminhao_id) : "",
    "",
    expense.status || "",
    "",
    Number(expense.valor || 0),
    expense.categoria || ""
  ]);

  return [...deliveryRows, ...paymentRows, ...fuelRows, ...expenseRows];
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function formatOrderStatus(status) {
  const labels = {
    aguardando_confirmacao: "Aguardando confirmacao",
    confirmado: "Confirmado",
    agendado: "Agendado",
    em_rota: "Em rota",
    em_entrega: "Em entrega",
    concluido: "Concluido",
    cancelado: "Cancelado"
  };

  return labels[status] || "Sem status";
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

function firstDayOfMonth(date) {
  return toInputDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function toInputDate(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function renderUnavailable(message) {
  app.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Relatorios indisponiveis</h2>
      <div class="empty-state">${escapeHtml(message)}</div>
    </section>
  `;
}
