import { enqueueSupabaseMutation, renderConnectionStatus } from "./offline.js";
import { bindPagination, getPageItems, normalizePage, renderPagination } from "./pagination.js";
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
  activeDeliveryFormId: null,
  signatureHasDrawing: false,
  selectedScheduleId: null,
  currentPage: 1,
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
    routeState.currentPage = 1;
    await loadRoute();
  });

  document.querySelector("#route-driver-filter")?.addEventListener("change", (event) => {
    routeState.motoristaFilter = event.target.value;
    routeState.currentPage = 1;
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
  routeState.currentPage = normalizePage(routeState.currentPage, items.length);
  const pageItems = getPageItems(items, routeState.currentPage);
  updateCountLabel(`${items.length} entrega${items.length === 1 ? "" : "s"}`);

  if (routeState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando rota...</div>`;
    return;
  }

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Nenhuma entrega agendada para esta data.</div>`;
    return;
  }

  list.innerHTML = pageItems
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
    .join("") + renderPagination(items.length, routeState.currentPage);

  list.querySelectorAll("[data-route-id]").forEach((button) => {
    button.addEventListener("click", () => {
      routeState.selectedScheduleId = button.dataset.routeId;
      renderRouteList();
      renderSelectedRouteItem();
    });
  });

  bindPagination(list, (page) => {
    routeState.currentPage = page;
    renderRouteList();
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

  document.querySelector("#delivery-register-button")?.addEventListener("click", async () => {
    await renderDeliveryForm(item);
  });
}

function buildStatusActions(pedido) {
  if (!pedido || ["cancelado", "concluido"].includes(pedido.status)) {
    return `<div class="empty-state">Pedido sem acao de rota disponivel.</div>`;
  }

  if (pedido.status === "em_entrega") {
    return `
      <button class="button" type="button" id="delivery-register-button">Registrar entrega</button>
      <div id="delivery-form-container"></div>
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

async function renderDeliveryForm(item) {
  const container = document.querySelector("#delivery-form-container");
  if (!container) {
    return;
  }

  const pedido = getPedido(item.pedido_id);
  const existingDelivery = await loadDelivery(item.pedido_id);
  const reservoirs = existingDelivery ? await loadDeliveryReservoirs(existingDelivery.id) : [];
  const now = new Date().toISOString();

  routeState.activeDeliveryFormId = item.id;
  routeState.signatureHasDrawing = false;

  container.innerHTML = `
    <section class="nested-panel delivery-form-panel">
      <div class="panel-heading">
        <h3>Registro da entrega</h3>
        <button class="ghost-button compact-button" type="button" id="cancel-delivery-form">Cancelar</button>
      </div>
      <form class="form" id="delivery-form">
        <div class="form-grid">
          ${inputField("horario_chegada", "Horario de chegada", toDateTimeLocal(existingDelivery?.horario_chegada || now), "datetime-local")}
          ${inputField("horario_saida", "Horario de saida", toDateTimeLocal(existingDelivery?.horario_saida), "datetime-local")}
          ${inputField("quilometragem_chegada", "Km de chegada", existingDelivery?.quilometragem_chegada, "number", false, "0.1")}
          ${inputField("quilometragem_saida", "Km de saida", existingDelivery?.quilometragem_saida, "number", false, "0.1")}
          ${inputField("quantidade_entregue_litros", "Litros entregues", existingDelivery?.quantidade_entregue_litros || pedido?.quantidade_solicitada_litros || 0, "number", true, "1")}
          ${inputField("nome_recebedor", "Nome de quem recebeu", existingDelivery?.nome_recebedor)}
          ${selectField("forma_pagamento", "Forma de pagamento", existingDelivery?.forma_pagamento || pedido?.forma_pagamento || "", paymentMethods)}
          ${inputField("valor_recebido", "Valor recebido", existingDelivery?.valor_recebido ?? pedido?.valor_total ?? 0, "number", true, "0.01")}
        </div>

        <label class="check-control">
          <input id="entrega_parcial" name="entrega_parcial" type="checkbox" ${existingDelivery?.entrega_parcial ? "checked" : ""}>
          Entrega parcial
        </label>

        ${textareaField("observacoes", "Observacoes", existingDelivery?.observacoes)}

        <section class="nested-panel">
          <h3>Reservatorios abastecidos</h3>
          <div class="reservoir-grid">
            ${[0, 1, 2, 3].map((index) => reservoirFields(index, reservoirs[index])).join("")}
          </div>
          <p class="field-hint">Use uma linha por reservatorio abastecido. Linhas vazias sao ignoradas.</p>
        </section>

        <section class="nested-panel">
          <h3>Foto e assinatura</h3>
          <div class="form-grid">
            <div class="field">
              <label for="foto_entrega">Foto da entrega</label>
              <input id="foto_entrega" name="foto_entrega" type="file" accept="image/jpeg,image/png,image/webp" capture="environment">
              <p class="field-hint">${existingDelivery?.foto_path ? "Ja existe foto salva. Envie outra para substituir." : "Opcional."}</p>
            </div>
          </div>
          <div class="field">
            <label for="signature-canvas">Assinatura opcional</label>
            <canvas class="signature-pad" id="signature-canvas" width="720" height="240"></canvas>
            <button class="ghost-button compact-button" id="clear-signature-button" type="button">Limpar assinatura</button>
            <p class="field-hint">${existingDelivery?.assinatura_path ? "Ja existe assinatura salva. Desenhe outra para substituir." : "Assinatura opcional."}</p>
          </div>
        </section>

        <button class="button" type="submit">Concluir entrega</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-delivery-form")?.addEventListener("click", () => {
    routeState.activeDeliveryFormId = null;
    container.innerHTML = "";
  });

  setupSignaturePad();

  document.querySelector("#delivery-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveDelivery(item, new FormData(event.currentTarget), existingDelivery, reservoirs);
  });
}

async function loadDelivery(orderId) {
  const { data, error } = await supabaseClient
    .from("entregas")
    .select("id, pedido_id, horario_chegada, horario_saida, quilometragem_chegada, quilometragem_saida, quantidade_entregue_litros, entrega_parcial, nome_recebedor, forma_pagamento, valor_recebido, foto_path, assinatura_path, observacoes, status")
    .eq("pedido_id", orderId)
    .maybeSingle();

  if (error) {
    showToast(error.message || "Nao foi possivel carregar registro da entrega.");
    return null;
  }

  return data;
}

async function loadDeliveryReservoirs(deliveryId) {
  const { data, error } = await supabaseClient
    .from("reservatorios_entrega")
    .select("id, descricao, capacidade_litros, quantidade_entregue_litros, observacoes")
    .eq("entrega_id", deliveryId)
    .order("created_at", { ascending: true });

  if (error) {
    showToast(error.message || "Nao foi possivel carregar reservatorios.");
    return [];
  }

  return data || [];
}

async function saveDelivery(item, formData, existingDelivery, existingReservoirs) {
  const profile = getCurrentProfile();
  const pedido = getPedido(item.pedido_id);
  const payload = {
    empresa_id: profile.empresa_id,
    pedido_id: item.pedido_id,
    agenda_id: item.id,
    cliente_id: pedido.cliente_id,
    local_entrega_id: pedido.local_entrega_id,
    motorista_id: item.motorista_id,
    caminhao_id: item.caminhao_id,
    horario_chegada: optionalDateTime(formData, "horario_chegada"),
    horario_saida: optionalDateTime(formData, "horario_saida"),
    quilometragem_chegada: optionalNumber(formData, "quilometragem_chegada"),
    quilometragem_saida: optionalNumber(formData, "quilometragem_saida"),
    quantidade_entregue_litros: positiveInteger(formData, "quantidade_entregue_litros", "Informe a quantidade entregue."),
    entrega_parcial: formData.get("entrega_parcial") === "on",
    nome_recebedor: optionalText(formData, "nome_recebedor"),
    forma_pagamento: optionalText(formData, "forma_pagamento"),
    valor_recebido: nonNegativeNumber(formData, "valor_recebido", "Informe um valor recebido valido."),
    observacoes: optionalText(formData, "observacoes"),
    status: "concluido",
    updated_by: profile.id,
    created_by: profile.id
  };

  if (!payload.quantidade_entregue_litros || payload.valor_recebido === null) {
    return;
  }

  if (payload.horario_saida && payload.horario_chegada && new Date(payload.horario_saida) < new Date(payload.horario_chegada)) {
    showToast("A saida nao pode ser anterior a chegada.");
    return;
  }

  if (
    payload.quilometragem_chegada !== null &&
    payload.quilometragem_saida !== null &&
    payload.quilometragem_saida < payload.quilometragem_chegada
  ) {
    showToast("A quilometragem de saida nao pode ser menor que a de chegada.");
    return;
  }

  if (!navigator.onLine) {
    const deliveryId = existingDelivery?.id || crypto.randomUUID();
    enqueueSupabaseMutation({
      table: "entregas",
      operation: "upsert",
      payload: existingDelivery?.id ? payload : { ...payload, id: deliveryId },
      options: { onConflict: "pedido_id" },
      label: "Entrega registrada"
    });

    buildReservoirRows(deliveryId, formData, existingReservoirs).forEach((row) => {
      const { id, ...reservoirPayload } = row;
      enqueueSupabaseMutation({
        table: "reservatorios_entrega",
        operation: id ? "update" : "insert",
        payload: reservoirPayload,
        match: id ? { id } : null,
        label: "Reservatorio registrado"
      });
    });

    enqueueSupabaseMutation({
      table: "pedidos",
      operation: "update",
      payload: { status: "concluido" },
      match: { id: item.pedido_id },
      label: "Pedido concluido"
    });

    warnOfflineDeliveryFiles(formData);
    pedido.status = "concluido";
    routeState.activeDeliveryFormId = null;
    document.querySelector("#delivery-form-container").innerHTML = "";
    renderRouteList();
    renderSelectedRouteItem();
    return;
  }

  const { data: delivery, error } = await supabaseClient
    .from("entregas")
    .upsert(payload, { onConflict: "pedido_id" })
    .select("id")
    .single();

  if (error) {
    showToast(error.message || "Nao foi possivel salvar a entrega.");
    return;
  }

  const fileUpdates = await uploadDeliveryFiles(delivery.id, formData);
  if (Object.keys(fileUpdates).length) {
    const { error: fileError } = await supabaseClient
      .from("entregas")
      .update(fileUpdates)
      .eq("id", delivery.id);

    if (fileError) {
      showToast("Entrega salva, mas nao foi possivel vincular todos os arquivos.");
    }
  }

  await saveReservoirs(delivery.id, formData, existingReservoirs);
  await markOrderCompleted(item.pedido_id);

  pedido.status = "concluido";
  showToast("Entrega concluida.");
  routeState.activeDeliveryFormId = null;
  await loadPedidos();
  renderRouteList();
  renderSelectedRouteItem();
}

async function uploadDeliveryFiles(deliveryId, formData) {
  const updates = {};
  const photo = formData.get("foto_entrega");

  if (photo instanceof File && photo.size > 0) {
    const extension = getFileExtension(photo.name, photo.type);
    const path = `${getCurrentProfile().empresa_id}/entregas/${deliveryId}/foto-${Date.now()}.${extension}`;
    const { error } = await supabaseClient.storage
      .from("fotos-entregas")
      .upload(path, photo, { upsert: true, contentType: photo.type || "image/jpeg" });

    if (error) {
      showToast(error.message || "Nao foi possivel enviar a foto.");
    } else {
      updates.foto_path = path;
    }
  }

  const signatureBlob = await getSignatureBlob();
  if (signatureBlob) {
    const path = `${getCurrentProfile().empresa_id}/entregas/${deliveryId}/assinatura-${Date.now()}.png`;
    const { error } = await supabaseClient.storage
      .from("assinaturas")
      .upload(path, signatureBlob, { upsert: true, contentType: "image/png" });

    if (error) {
      showToast(error.message || "Nao foi possivel enviar a assinatura.");
    } else {
      updates.assinatura_path = path;
    }
  }

  return updates;
}

async function saveReservoirs(deliveryId, formData, existingReservoirs) {
  const rows = buildReservoirRows(deliveryId, formData, existingReservoirs);

  for (const row of rows) {
    const { id, ...payload } = row;
    const query = id
      ? supabaseClient.from("reservatorios_entrega").update(payload).eq("id", id)
      : supabaseClient.from("reservatorios_entrega").insert(payload);

    const { error } = await query;
    if (error) {
      showToast(error.message || "Nao foi possivel salvar um reservatorio.");
      return;
    }
  }
}

function buildReservoirRows(deliveryId, formData, existingReservoirs) {
  return [0, 1, 2, 3].map((index) => ({
    id: existingReservoirs[index]?.id,
    empresa_id: getCurrentProfile().empresa_id,
    entrega_id: deliveryId,
    descricao: optionalText(formData, `reservatorio_descricao_${index}`),
    capacidade_litros: optionalInteger(formData, `reservatorio_capacidade_${index}`),
    quantidade_entregue_litros: optionalInteger(formData, `reservatorio_quantidade_${index}`) || 0,
    observacoes: optionalText(formData, `reservatorio_observacoes_${index}`)
  })).filter((row) => row.descricao || row.capacidade_litros !== null || row.quantidade_entregue_litros > 0 || row.observacoes);
}

function warnOfflineDeliveryFiles(formData) {
  const photo = formData.get("foto_entrega");
  if (photo instanceof File && photo.size > 0) {
    showToast("A foto nao foi anexada offline. Envie a imagem depois que sincronizar.");
  }

  if (routeState.signatureHasDrawing) {
    showToast("A assinatura nao foi anexada offline. Reenvie quando estiver online.");
  }
}

async function markOrderCompleted(orderId) {
  const { error } = await supabaseClient
    .from("pedidos")
    .update({ status: "concluido" })
    .eq("id", orderId);

  if (error) {
    showToast("Entrega salva, mas o pedido nao foi marcado como concluido.");
  }
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

function reservoirFields(index, reservoir = {}) {
  return `
    <div class="reservoir-row">
      ${inputField(`reservatorio_descricao_${index}`, `Reservatorio ${index + 1}`, reservoir.descricao)}
      ${inputField(`reservatorio_capacidade_${index}`, "Capacidade L", reservoir.capacidade_litros, "number", false, "1")}
      ${inputField(`reservatorio_quantidade_${index}`, "Entregue L", reservoir.quantidade_entregue_litros, "number", false, "1")}
      ${inputField(`reservatorio_observacoes_${index}`, "Observacoes", reservoir.observacoes)}
    </div>
  `;
}

function setupSignaturePad() {
  const canvas = document.querySelector("#signature-canvas");
  const clearButton = document.querySelector("#clear-signature-button");
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#13201e";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";

  let drawing = false;

  const getPoint = (event) => {
    const source = event.touches?.[0] || event;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (source.clientX - rect.left) * (canvas.width / rect.width),
      y: (source.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const start = (event) => {
    event.preventDefault();
    drawing = true;
    routeState.signatureHasDrawing = true;
    const point = getPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const move = (event) => {
    if (!drawing) {
      return;
    }
    event.preventDefault();
    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stop = () => {
    drawing = false;
  };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseup", stop);
  canvas.addEventListener("mouseleave", stop);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", stop);

  clearButton?.addEventListener("click", () => {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    routeState.signatureHasDrawing = false;
  });
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

function optionalText(formData, field) {
  const value = String(formData.get(field) || "").trim();
  return value || null;
}

function optionalNumber(formData, field) {
  const value = optionalText(formData, field);
  return value === null ? null : Number(value);
}

function optionalInteger(formData, field) {
  const value = optionalText(formData, field);
  return value === null ? null : Number.parseInt(value, 10);
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

function parseInputDate(value) {
  const [year, month, day] = String(value || toInputDate(new Date())).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toInputDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
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

async function getSignatureBlob() {
  if (!routeState.signatureHasDrawing) {
    return null;
  }

  const canvas = document.querySelector("#signature-canvas");
  if (!canvas) {
    return null;
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function getFileExtension(fileName, mimeType) {
  const extension = String(fileName || "").split(".").pop()?.toLowerCase();
  if (extension && ["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  const byMime = {
    "image/png": "png",
    "image/webp": "webp",
    "image/jpeg": "jpg"
  };

  return byMime[mimeType] || "jpg";
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
