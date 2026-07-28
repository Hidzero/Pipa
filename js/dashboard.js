import { renderConnectionStatus } from "./offline.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const pendingOrderStatuses = ["aguardando_confirmacao", "confirmado"];
const activeDeliveryStatuses = ["agendado", "em_rota", "em_entrega"];

export async function renderDashboardPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para carregar o painel.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  renderLoading(profile);

  try {
    const data = await loadDashboardData(profile);
    renderDashboard(profile, data);
  } catch (error) {
    showToast(error.message || "Nao foi possivel carregar o painel.");
    renderUnavailable("Nao foi possivel carregar os dados do painel.");
  }
}

function renderLoading(profile) {
  app.innerHTML = `
    <section class="section-stack">
      ${statusBar(profile)}
      <section class="dashboard-grid" aria-label="Resumo do dia">
        ${metricCard("Entregas hoje", "...")}
        ${metricCard("Pedidos pendentes", "...")}
        ${metricCard("Recebido hoje", "...")}
        ${metricCard("Litros entregues", "...")}
      </section>
      <section class="panel">
        <h2 class="panel-title">Carregando painel</h2>
        <div class="empty-state">Buscando dados do Supabase...</div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function renderDashboard(profile, data) {
  const metrics = buildMetrics(profile, data);
  const nextDeliveries = getNextDeliveries(data);
  const alerts = buildAlerts(profile, data);
  const actions = getQuickActions(profile.funcao);

  app.innerHTML = `
    <section class="section-stack">
      ${statusBar(profile)}

      <section class="dashboard-grid" aria-label="Resumo do dia">
        ${metricCard("Entregas hoje", metrics.todayDeliveries)}
        ${metricCard("Proxima entrega", metrics.nextDelivery)}
        ${metricCard("Pedidos pendentes", metrics.pendingOrders)}
        ${metricCard("Recebido hoje", metrics.receivedToday)}
        ${metricCard("Em aberto", metrics.openAmount)}
        ${metricCard("Litros entregues", metrics.deliveredLiters)}
        ${metricCard("Caminhoes disp.", metrics.availableTrucks)}
        ${metricCard("Alertas", metrics.alertCount)}
      </section>

      <section class="dashboard-sections">
        <section class="panel">
          <div class="panel-heading">
            <h2 class="panel-title">Proximas entregas</h2>
            <button class="ghost-button compact-button" type="button" id="refresh-dashboard-button">Atualizar</button>
          </div>
          ${nextDeliveries.length ? deliveryList(nextDeliveries, data) : `<div class="empty-state">Nenhuma entrega agendada para os proximos dias.</div>`}
        </section>

        <section class="panel">
          <h2 class="panel-title">Alertas</h2>
          ${alerts.length ? alertList(alerts) : `<div class="empty-state">Nenhum alerta importante agora.</div>`}
        </section>
      </section>

      <section class="panel">
        <h2 class="panel-title">Acoes rapidas</h2>
        <div class="quick-actions">
          ${actions.map((action) => `<a class="${action.className}" href="#${action.route}">${action.label}</a>`).join("")}
        </div>
      </section>
    </section>
  `;

  document.querySelector("#refresh-dashboard-button")?.addEventListener("click", () => {
    renderDashboardPage();
  });

  renderConnectionStatus();
}

async function loadDashboardData(profile) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const nextWeek = addDays(todayStart, 7);
  const todayKey = toInputDate(now);
  const canSeeFinancials = profile.funcao !== "motorista";

  const [
    agendaToday,
    upcomingAgenda,
    pedidos,
    entregasToday,
    pagamentos,
    caminhoes,
    clientes,
    locais
  ] = await Promise.all([
    loadAgenda(profile, todayStart, tomorrowStart),
    loadAgenda(profile, now, nextWeek),
    loadPedidos(profile),
    loadEntregasToday(profile, todayStart, tomorrowStart),
    canSeeFinancials ? loadPagamentos(profile) : Promise.resolve([]),
    loadCaminhoes(profile),
    loadClientes(profile),
    loadLocais(profile)
  ]);

  return {
    todayKey,
    agendaToday,
    upcomingAgenda,
    pedidos,
    entregasToday,
    pagamentos,
    caminhoes,
    clientes,
    locais,
    canSeeFinancials
  };
}

async function loadAgenda(profile, start, end) {
  let query = supabaseClient
    .from("agenda_entregas")
    .select("id, pedido_id, motorista_id, caminhao_id, data_inicio, data_fim, ordem, observacoes")
    .eq("empresa_id", profile.empresa_id)
    .gte("data_inicio", start.toISOString())
    .lt("data_inicio", end.toISOString())
    .order("data_inicio", { ascending: true })
    .order("ordem", { ascending: true })
    .limit(100);

  if (profile.funcao === "motorista") {
    query = query.eq("motorista_id", profile.id);
  }

  return fetchRows(query, "Nao foi possivel carregar agenda.");
}

async function loadPedidos(profile) {
  const query = supabaseClient
    .from("pedidos")
    .select("id, cliente_id, local_entrega_id, quantidade_solicitada_litros, data_hora_solicitada, valor_total, forma_pagamento, prioridade, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false })
    .limit(500);

  return fetchRows(query, "Nao foi possivel carregar pedidos.");
}

async function loadEntregasToday(profile, start, end) {
  let query = supabaseClient
    .from("entregas")
    .select("id, pedido_id, cliente_id, local_entrega_id, motorista_id, caminhao_id, quantidade_entregue_litros, valor_recebido, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  if (profile.funcao === "motorista") {
    query = query.eq("motorista_id", profile.id);
  }

  return fetchRows(query, "Nao foi possivel carregar entregas.");
}

async function loadPagamentos(profile) {
  const query = supabaseClient
    .from("pagamentos")
    .select("id, valor_total, valor_pago, valor_pendente, data_pagamento, status, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: false })
    .limit(1000);

  return fetchRows(query, "Nao foi possivel carregar pagamentos.");
}

async function loadCaminhoes(profile) {
  const query = supabaseClient
    .from("caminhoes")
    .select("id, nome, placa, status, ativo")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  return fetchRows(query, "Nao foi possivel carregar caminhoes.");
}

async function loadClientes(profile) {
  const query = supabaseClient
    .from("clientes")
    .select("id, nome, telefone")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true })
    .limit(500);

  return fetchRows(query, "Nao foi possivel carregar clientes.");
}

async function loadLocais(profile) {
  const query = supabaseClient
    .from("locais_entrega")
    .select("id, cliente_id, nome, endereco, ponto_referencia")
    .eq("empresa_id", profile.empresa_id)
    .order("created_at", { ascending: true })
    .limit(500);

  return fetchRows(query, "Nao foi possivel carregar locais.");
}

async function fetchRows(query, message) {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || message);
  }
  return data || [];
}

function buildMetrics(profile, data) {
  const pendingOrders = data.pedidos.filter((pedido) => pendingOrderStatuses.includes(pedido.status)).length;
  const deliveredLiters = data.entregasToday.reduce((total, entrega) => total + Number(entrega.quantidade_entregue_litros || 0), 0);
  const availableTrucks = data.caminhoes.filter((truck) => truck.ativo && truck.status === "disponivel").length;
  const nextDelivery = getNextDeliveries(data)[0];
  const alerts = buildAlerts(profile, data);

  const receivedToday = data.canSeeFinancials
    ? data.pagamentos
        .filter((payment) => payment.status !== "cancelado" && payment.data_pagamento === data.todayKey)
        .reduce((total, payment) => total + Number(payment.valor_pago || 0), 0)
    : data.entregasToday.reduce((total, entrega) => total + Number(entrega.valor_recebido || 0), 0);

  const openAmount = data.canSeeFinancials
    ? data.pagamentos
        .filter((payment) => !["pago", "cancelado"].includes(payment.status))
        .reduce((total, payment) => total + Number(payment.valor_pendente || 0), 0)
    : 0;

  return {
    todayDeliveries: String(data.agendaToday.length),
    nextDelivery: nextDelivery ? formatShortDateTime(nextDelivery.data_inicio) : "-",
    pendingOrders: String(pendingOrders),
    receivedToday: formatCurrency(receivedToday),
    openAmount: data.canSeeFinancials ? formatCurrency(openAmount) : "-",
    deliveredLiters: formatLiters(deliveredLiters),
    availableTrucks: String(availableTrucks),
    alertCount: String(alerts.length)
  };
}

function getNextDeliveries(data) {
  return data.upcomingAgenda
    .filter((item) => {
      const pedido = getPedido(data, item.pedido_id);
      return !pedido || activeDeliveryStatuses.includes(pedido.status);
    })
    .sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio))
    .slice(0, 5);
}

function buildAlerts(profile, data) {
  const alerts = [];
  const pendingOrders = data.pedidos.filter((pedido) => pendingOrderStatuses.includes(pedido.status)).length;
  const unassignedToday = data.agendaToday.filter((item) => !item.motorista_id || !item.caminhao_id).length;
  const unavailableTrucks = data.caminhoes.filter((truck) => truck.ativo && ["manutencao", "inativo"].includes(truck.status)).length;
  const overduePayments = data.pagamentos.filter((payment) => payment.status === "vencido").length;

  if (pendingOrders > 0) {
    alerts.push(`${pendingOrders} pedido${pendingOrders === 1 ? "" : "s"} aguardando confirmacao.`);
  }

  if (profile.funcao !== "motorista" && unassignedToday > 0) {
    alerts.push(`${unassignedToday} entrega${unassignedToday === 1 ? "" : "s"} de hoje sem motorista ou caminhao.`);
  }

  if (data.canSeeFinancials && overduePayments > 0) {
    alerts.push(`${overduePayments} pagamento${overduePayments === 1 ? "" : "s"} vencido${overduePayments === 1 ? "" : "s"}.`);
  }

  if (unavailableTrucks > 0) {
    alerts.push(`${unavailableTrucks} caminhao${unavailableTrucks === 1 ? "" : "es"} em manutencao ou inativo.`);
  }

  if (!data.agendaToday.length) {
    alerts.push("Nenhuma entrega agendada para hoje.");
  }

  return alerts;
}

function deliveryList(items, data) {
  return `
    <div class="list">
      ${items.map((item) => {
        const pedido = getPedido(data, item.pedido_id);
        const cliente = getCliente(data, pedido?.cliente_id);
        const local = getLocal(data, pedido?.local_entrega_id);
        const truck = getTruck(data, item.caminhao_id);

        return `
          <article class="list-item">
            <div class="panel-heading compact-heading">
              <div>
                <strong>${formatShortDateTime(item.data_inicio)} · ${escapeHtml(cliente?.nome || "Cliente")}</strong>
                <span>${formatLiters(pedido?.quantidade_solicitada_litros)} · ${formatCurrency(pedido?.valor_total)}</span>
              </div>
              <span class="status-pill ${getOrderStatusClass(pedido?.status)}">${formatOrderStatus(pedido?.status)}</span>
            </div>
            <dl class="details-list compact-details">
              <div><dt>Endereco</dt><dd>${escapeHtml(local?.endereco || "-")}</dd></div>
              <div><dt>Telefone</dt><dd>${escapeHtml(cliente?.telefone || "-")}</dd></div>
              <div><dt>Caminhao</dt><dd>${escapeHtml(truck ? `${truck.nome} · ${truck.placa}` : "-")}</dd></div>
            </dl>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function alertList(alerts) {
  return `
    <div class="alert-list">
      ${alerts.map((alert) => `<div class="alert-item">${escapeHtml(alert)}</div>`).join("")}
    </div>
  `;
}

function statusBar(profile) {
  return `
    <div class="status-bar">
      <div>
        <strong>${escapeHtml(profile.nome)}</strong>
        <div>${formatRole(profile.funcao)}</div>
      </div>
      <div>
        <span class="connection-status" id="connection-status">Online</span>
        <div id="pending-sync-count">0 pendentes</div>
      </div>
    </div>
  `;
}

function metricCard(label, value) {
  return `
    <article class="card metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function getQuickActions(role) {
  const actions = {
    administrador: [
      { route: "/clientes", label: "Novo cliente", className: "button" },
      { route: "/caminhoes", label: "Gerenciar frota", className: "secondary-button" },
      { route: "/pedidos", label: "Novo pedido", className: "ghost-button" },
      { route: "/rota", label: "Ver rota", className: "ghost-button" },
      { route: "/financeiro", label: "Financeiro", className: "ghost-button" }
    ],
    atendente: [
      { route: "/clientes", label: "Novo cliente", className: "button" },
      { route: "/pedidos", label: "Novo pedido", className: "secondary-button" },
      { route: "/rota", label: "Ver rota", className: "ghost-button" }
    ],
    motorista: [
      { route: "/rota", label: "Ver entregas de hoje", className: "button" }
    ],
    financeiro: [
      { route: "/financeiro", label: "Ver financeiro", className: "button" }
    ]
  };

  return actions[role] || [];
}

function getPedido(data, id) {
  return data.pedidos.find((pedido) => pedido.id === id) || null;
}

function getCliente(data, id) {
  return data.clientes.find((cliente) => cliente.id === id) || null;
}

function getLocal(data, id) {
  return data.locais.find((local) => local.id === id) || null;
}

function getTruck(data, id) {
  return data.caminhoes.find((truck) => truck.id === id) || null;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toInputDate(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatRole(role) {
  const labels = {
    administrador: "Administrador",
    atendente: "Atendente",
    motorista: "Motorista",
    financeiro: "Financeiro"
  };

  return labels[role] || "Usuario";
}

function formatOrderStatus(status) {
  const labels = {
    aguardando_confirmacao: "Aguardando",
    confirmado: "Confirmado",
    agendado: "Agendado",
    em_rota: "Em rota",
    em_entrega: "Em entrega",
    concluido: "Concluido",
    cancelado: "Cancelado"
  };

  return labels[status] || "Sem status";
}

function getOrderStatusClass(status) {
  if (status === "concluido") {
    return "active";
  }
  if (status === "em_rota" || status === "em_entrega") {
    return "info";
  }
  if (status === "aguardando_confirmacao") {
    return "warning";
  }
  if (status === "cancelado") {
    return "inactive";
  }
  return "pending";
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

function formatTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderUnavailable(message) {
  app.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Painel indisponivel</h2>
      <div class="empty-state">${escapeHtml(message)}</div>
    </section>
  `;
}
