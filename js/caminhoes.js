import { renderConnectionStatus } from "./offline.js";
import { bindPagination, getPageItems, normalizePage, renderPagination } from "./pagination.js";
import { canManageCompany, canManageTruckAssignments } from "./permissions.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const truckState = {
  caminhoes: [],
  motoristas: [],
  vinculos: [],
  selectedTruckId: null,
  currentPage: 1,
  searchTerm: "",
  showInactive: false,
  formMode: null,
  assignmentFormOpen: false,
  isLoading: false
};

const truckStatuses = [
  ["disponivel", "Disponivel"],
  ["em_rota", "Em rota"],
  ["manutencao", "Manutencao"],
  ["inativo", "Inativo"]
];

const assignmentTypes = [
  ["principal", "Principal"],
  ["substituto", "Substituto"],
  ["temporario", "Temporario"]
];

export async function renderCaminhoesPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para gerenciar caminhoes.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  renderShell();
  bindShellEvents();
  await Promise.all([loadMotoristas(), loadCaminhoes(), loadVinculos()]);
}

function renderShell() {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Caminhoes</strong>
          <div id="caminhoes-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar">
          <div class="field search-field">
            <label for="caminhoes-search">Buscar</label>
            <input id="caminhoes-search" type="search" placeholder="Nome, placa ou motorista" value="${escapeAttribute(truckState.searchTerm)}">
          </div>
          <label class="check-control">
            <input id="caminhoes-show-inactive" type="checkbox" ${truckState.showInactive ? "checked" : ""}>
            Mostrar inativos
          </label>
          ${canWriteTrucks() ? `<button class="button" type="button" id="new-truck-button">Novo caminhao</button>` : ""}
        </div>
      </section>

      <div id="truck-form-container"></div>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title">Frota cadastrada</h2>
          <div class="list" id="caminhoes-list">
            <div class="empty-state">Carregando caminhoes...</div>
          </div>
        </div>

        <div class="detail-column" id="caminhao-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione um caminhao.</div>
          </section>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelector("#caminhoes-search")?.addEventListener("input", (event) => {
    truckState.searchTerm = event.target.value;
    truckState.currentPage = 1;
    renderCaminhoesList();
  });

  document.querySelector("#caminhoes-show-inactive")?.addEventListener("change", async (event) => {
    truckState.showInactive = event.target.checked;
    await loadCaminhoes();
  });

  document.querySelector("#new-truck-button")?.addEventListener("click", () => {
    truckState.formMode = "new";
    renderTruckForm();
  });
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
    truckState.motoristas = [];
    showToast(error.message || "Nao foi possivel carregar motoristas.");
    return;
  }

  truckState.motoristas = data || [];
}

async function loadCaminhoes() {
  const profile = getCurrentProfile();
  truckState.isLoading = true;
  updateCountLabel("Carregando...");

  let query = supabaseClient
    .from("caminhoes")
    .select("id, nome, placa, capacidade_litros, quilometragem, motorista_responsavel_id, status, consumo_medio_km_l, observacoes, ativo, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (!truckState.showInactive) {
    query = query.eq("ativo", true);
  }

  const { data, error } = await query;
  truckState.isLoading = false;

  if (error) {
    showToast(error.message || "Nao foi possivel carregar caminhoes.");
    document.querySelector("#caminhoes-list").innerHTML = `<div class="empty-state">Erro ao carregar caminhoes.</div>`;
    updateCountLabel("Erro");
    return;
  }

  truckState.caminhoes = data || [];

  if (!truckState.selectedTruckId || !truckState.caminhoes.some((truck) => truck.id === truckState.selectedTruckId)) {
    truckState.selectedTruckId = truckState.caminhoes[0]?.id || null;
  }

  renderCaminhoesList();
  renderSelectedTruck();
}

async function loadVinculos() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("caminhao_motoristas")
    .select("id, caminhao_id, motorista_id, data_inicio, data_fim, tipo, observacoes, ativo, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("data_inicio", { ascending: false })
    .limit(1000);

  if (error) {
    truckState.vinculos = [];
    showToast("Historico motorista x caminhao indisponivel. Execute o SQL supabase/caminhao-motoristas.sql.");
    return;
  }

  truckState.vinculos = data || [];
  renderSelectedTruck();
}

function renderCaminhoesList() {
  const list = document.querySelector("#caminhoes-list");
  if (!list) {
    return;
  }

  const caminhoes = getFilteredCaminhoes();
  truckState.currentPage = normalizePage(truckState.currentPage, caminhoes.length);
  const pageCaminhoes = getPageItems(caminhoes, truckState.currentPage);
  updateCountLabel(`${caminhoes.length} caminhao${caminhoes.length === 1 ? "" : "es"}`);

  if (truckState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando caminhoes...</div>`;
    return;
  }

  if (!caminhoes.length) {
    list.innerHTML = `<div class="empty-state">Nenhum caminhao encontrado.</div>`;
    return;
  }

  list.innerHTML = pageCaminhoes
    .map((truck) => `
      <button class="list-item list-button ${truck.id === truckState.selectedTruckId ? "selected" : ""}" type="button" data-truck-id="${truck.id}">
        <span class="item-main">
          <strong>${escapeHtml(truck.nome)}</strong>
          <span>${escapeHtml(truck.placa)} · ${formatLiters(truck.capacidade_litros)}</span>
          <span>${escapeHtml(getMotoristaName(truck.motorista_responsavel_id) || "Sem motorista responsavel")}</span>
        </span>
        <span class="status-pill ${getStatusClass(truck)}">${formatTruckStatus(truck.status)}</span>
      </button>
    `)
    .join("") + renderPagination(caminhoes.length, truckState.currentPage);

  list.querySelectorAll("[data-truck-id]").forEach((button) => {
    button.addEventListener("click", () => {
      truckState.selectedTruckId = button.dataset.truckId;
      truckState.formMode = null;
      renderCaminhoesList();
      renderSelectedTruck();
    });
  });

  bindPagination(list, (page) => {
    truckState.currentPage = page;
    renderCaminhoesList();
  });
}

function renderSelectedTruck() {
  const detail = document.querySelector("#caminhao-detail");
  if (!detail) {
    return;
  }

  const truck = getSelectedTruck();
  if (!truck) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione um caminhao.</div>
      </section>
    `;
    return;
  }

  const activeAssignment = getActiveAssignment(truck.id);
  const canWriteTruck = canWriteTrucks();
  const canWriteAssignments = canWriteTruckAssignments();

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(truck.nome)}</h2>
          <p class="field-hint">${escapeHtml(truck.placa)} · ${formatTruckStatus(truck.status)} · ${truck.ativo ? "Ativo" : "Inativo"}</p>
        </div>
        ${canWriteTruck ? `<div class="inline-actions">
          <button class="ghost-button compact-button" type="button" id="edit-truck-button">Editar</button>
          <button class="ghost-button compact-button danger-text" type="button" id="toggle-truck-button">${truck.ativo ? "Inativar" : "Reativar"}</button>
        </div>` : ""}
      </div>

      <dl class="details-list">
        <div><dt>Capacidade</dt><dd>${formatLiters(truck.capacidade_litros)}</dd></div>
        <div><dt>Quilometragem</dt><dd>${formatKm(truck.quilometragem)}</dd></div>
        <div><dt>Motorista responsavel</dt><dd>${escapeHtml(getMotoristaName(truck.motorista_responsavel_id) || "-")}</dd></div>
        <div><dt>Vinculo atual</dt><dd>${escapeHtml(activeAssignment ? `${getMotoristaName(activeAssignment.motorista_id)} · ${formatAssignmentType(activeAssignment.tipo)} desde ${formatDate(activeAssignment.data_inicio)}` : "-")}</dd></div>
        <div><dt>Consumo medio</dt><dd>${truck.consumo_medio_km_l ? `${formatDecimal(truck.consumo_medio_km_l)} km/L` : "-"}</dd></div>
        <div><dt>Observacoes</dt><dd>${escapeHtml(truck.observacoes || "-")}</dd></div>
      </dl>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">Motoristas do caminhao</h2>
          <p class="field-hint">Historico formal de quem ficou neste veiculo.</p>
        </div>
        ${canWriteAssignments ? `<button class="button compact-button" type="button" id="new-assignment-button">Novo vinculo</button>` : ""}
      </div>
      <div id="assignment-form-container"></div>
      ${renderAssignments(truck.id)}
    </section>
  `;

  document.querySelector("#edit-truck-button")?.addEventListener("click", () => {
    truckState.formMode = truck.id;
    renderTruckForm();
  });

  document.querySelector("#toggle-truck-button")?.addEventListener("click", async () => {
    await toggleTruck(truck);
  });

  document.querySelector("#new-assignment-button")?.addEventListener("click", () => {
    truckState.assignmentFormOpen = true;
    renderSelectedTruck();
  });

  document.querySelector("#cancel-assignment-form")?.addEventListener("click", () => {
    truckState.assignmentFormOpen = false;
    renderSelectedTruck();
  });

  document.querySelector("#assignment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveAssignment(truck, new FormData(event.currentTarget));
  });

  document.querySelectorAll("[data-end-assignment]").forEach((button) => {
    button.addEventListener("click", async () => {
      await endAssignment(button.dataset.endAssignment);
    });
  });
}

function renderAssignments(truckId) {
  const assignments = getAssignmentsForTruck(truckId);
  const form = truckState.assignmentFormOpen ? renderAssignmentForm() : "";

  if (!assignments.length) {
    return `
      ${form}
      <div class="empty-state">Nenhum vinculo registrado para este caminhao.</div>
    `;
  }

  return `
    ${form}
    <div class="list">
      ${assignments.map((assignment) => `
        <article class="list-item">
          <div class="panel-heading compact-heading">
            <div>
              <strong>${escapeHtml(getMotoristaName(assignment.motorista_id) || "Motorista")}</strong>
              <span>${formatAssignmentType(assignment.tipo)} · ${formatDate(assignment.data_inicio)} ate ${assignment.data_fim ? formatDate(assignment.data_fim) : "atual"}</span>
            </div>
            <span class="status-pill ${assignment.ativo ? "active" : "inactive"}">${assignment.ativo ? "Ativo" : "Encerrado"}</span>
          </div>
          <dl class="details-list compact-details">
            <div><dt>Observacoes</dt><dd>${escapeHtml(assignment.observacoes || "-")}</dd></div>
          </dl>
          ${assignment.ativo && canWriteTruckAssignments() ? `
            <div class="inline-actions">
              <button class="ghost-button compact-button danger-text" type="button" data-end-assignment="${assignment.id}">Encerrar vinculo</button>
            </div>
          ` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderAssignmentForm() {
  return `
    <section class="nested-panel">
      <div class="panel-heading">
        <h3>Novo vinculo</h3>
        <button class="ghost-button compact-button" type="button" id="cancel-assignment-form">Cancelar</button>
      </div>
      <form class="form" id="assignment-form">
        <div class="form-grid">
          ${selectField("motorista_id", "Motorista", "", getRequiredMotoristaOptions())}
          ${selectField("tipo", "Tipo", "principal", assignmentTypes)}
          ${inputField("data_inicio", "Inicio", toInputDate(new Date()), "date", true)}
          ${inputField("data_fim", "Fim", "", "date")}
        </div>
        ${textareaField("observacoes", "Observacoes")}
        <button class="button" type="submit">Salvar vinculo</button>
      </form>
    </section>
  `;
}

function renderTruckForm() {
  if (!canWriteTrucks()) {
    showToast("Apenas administrador pode cadastrar ou editar caminhoes.");
    return;
  }

  const container = document.querySelector("#truck-form-container");
  if (!container) {
    return;
  }

  const isEdit = truckState.formMode && truckState.formMode !== "new";
  const truck = isEdit ? truckState.caminhoes.find((item) => item.id === truckState.formMode) : {};

  container.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <h2 class="panel-title">${isEdit ? "Editar caminhao" : "Novo caminhao"}</h2>
        <button class="ghost-button compact-button" type="button" id="cancel-truck-form">Cancelar</button>
      </div>
      <form class="form" id="truck-form">
        <div class="form-grid">
          ${inputField("nome", "Nome ou identificacao", truck?.nome, "text", true)}
          ${inputField("placa", "Placa", truck?.placa, "text", true)}
          ${inputField("capacidade_litros", "Capacidade em litros", truck?.capacidade_litros, "number", true, "1")}
          ${inputField("quilometragem", "Quilometragem", truck?.quilometragem ?? 0, "number", true, "0.1")}
          ${selectField("motorista_responsavel_id", "Motorista responsavel", truck?.motorista_responsavel_id || "", getMotoristaOptions())}
          ${selectField("status", "Status", truck?.status || "disponivel", truckStatuses)}
          ${inputField("consumo_medio_km_l", "Consumo medio km/L", truck?.consumo_medio_km_l, "number", false, "0.01")}
        </div>
        ${textareaField("observacoes", "Observacoes", truck?.observacoes)}
        <button class="button" type="submit">${isEdit ? "Salvar caminhao" : "Cadastrar caminhao"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-truck-form")?.addEventListener("click", () => {
    truckState.formMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#truck-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveTruck(new FormData(event.currentTarget), truck);
  });
}

async function saveTruck(formData, existingTruck = {}) {
  if (!canWriteTrucks()) {
    showToast("Apenas administrador pode salvar caminhoes.");
    return;
  }

  const profile = getCurrentProfile();
  const payload = {
    nome: requiredText(formData, "nome", "Informe o nome do caminhao."),
    placa: requiredText(formData, "placa", "Informe a placa do caminhao."),
    capacidade_litros: positiveInteger(formData, "capacidade_litros", "Informe a capacidade em litros."),
    quilometragem: nonNegativeNumber(formData, "quilometragem", "Informe a quilometragem."),
    motorista_responsavel_id: optionalText(formData, "motorista_responsavel_id"),
    status: String(formData.get("status") || "disponivel"),
    consumo_medio_km_l: optionalNumber(formData, "consumo_medio_km_l"),
    observacoes: optionalText(formData, "observacoes"),
    updated_by: profile.id
  };

  if (!payload.nome || !payload.placa || !payload.capacidade_litros || payload.quilometragem === null) {
    return;
  }

  if (payload.consumo_medio_km_l !== null && payload.consumo_medio_km_l <= 0) {
    showToast("O consumo medio precisa ser maior que zero.");
    return;
  }

  payload.placa = payload.placa.toUpperCase();
  payload.ativo = payload.status !== "inativo";

  const isEdit = Boolean(existingTruck?.id);
  const query = isEdit
    ? supabaseClient.from("caminhoes").update(payload).eq("id", existingTruck.id).select("id").single()
    : supabaseClient.from("caminhoes").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      }).select("id").single();

  const { data, error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o caminhao.");
    return;
  }

  const previousDriverId = existingTruck?.motorista_responsavel_id || null;
  const nextDriverId = payload.motorista_responsavel_id || null;
  if (previousDriverId !== nextDriverId) {
    await syncResponsibleAssignment(data?.id || existingTruck.id, nextDriverId);
  }

  showToast(isEdit ? "Caminhao atualizado." : "Caminhao cadastrado.");
  truckState.formMode = null;
  document.querySelector("#truck-form-container").innerHTML = "";
  await Promise.all([loadCaminhoes(), loadVinculos()]);
}

async function saveAssignment(truck, formData) {
  if (!canWriteTruckAssignments()) {
    showToast("Apenas administrador ou supervisor pode vincular motoristas.");
    return;
  }

  const profile = getCurrentProfile();
  const motoristaId = requiredText(formData, "motorista_id", "Selecione o motorista.");
  const dataInicio = requiredText(formData, "data_inicio", "Informe a data inicial.");
  const dataFim = optionalText(formData, "data_fim");
  const tipo = String(formData.get("tipo") || "principal");

  if (!motoristaId || !dataInicio) {
    return;
  }

  if (dataFim && new Date(`${dataFim}T00:00:00`) < new Date(`${dataInicio}T00:00:00`)) {
    showToast("A data final nao pode ser anterior ao inicio.");
    return;
  }

  if (tipo === "principal") {
    const closed = await closeActivePrincipalAssignments(truck.id, dataInicio);
    if (!closed) {
      return;
    }
  }

  const payload = {
    empresa_id: profile.empresa_id,
    caminhao_id: truck.id,
    motorista_id: motoristaId,
    data_inicio: dataInicio,
    data_fim: dataFim,
    tipo,
    observacoes: optionalText(formData, "observacoes"),
    ativo: !dataFim,
    created_by: profile.id,
    updated_by: profile.id
  };

  const { error } = await supabaseClient
    .from("caminhao_motoristas")
    .insert(payload);

  if (error) {
    showToast(error.message || "Nao foi possivel salvar o vinculo.");
    return;
  }

  if (tipo === "principal" && !dataFim) {
    await updateTruckResponsibleDriver(truck.id, motoristaId);
  }

  showToast("Vinculo registrado.");
  truckState.assignmentFormOpen = false;
  await loadVinculos();
  await loadCaminhoes();
}

async function closeActivePrincipalAssignments(truckId, nextStartDate) {
  const profile = getCurrentProfile();
  const endDate = previousDate(nextStartDate);
  const activePrincipals = truckState.vinculos.filter((assignment) =>
    assignment.caminhao_id === truckId &&
    assignment.tipo === "principal" &&
    assignment.ativo
  );

  for (const assignment of activePrincipals) {
    const safeEndDate = new Date(`${endDate}T00:00:00`) < new Date(`${assignment.data_inicio}T00:00:00`)
      ? assignment.data_inicio
      : endDate;
    const { error } = await supabaseClient
      .from("caminhao_motoristas")
      .update({
        data_fim: safeEndDate,
        ativo: false,
        updated_by: profile.id
      })
      .eq("id", assignment.id);

    if (error) {
      showToast(error.message || "Nao foi possivel encerrar vinculo anterior.");
      return false;
    }
  }

  return true;
}

async function endAssignment(id) {
  if (!canWriteTruckAssignments()) {
    showToast("Apenas administrador ou supervisor pode encerrar vinculos.");
    return;
  }

  const profile = getCurrentProfile();
  const assignment = truckState.vinculos.find((item) => item.id === id);
  if (!assignment) {
    return;
  }

  const endDate = window.prompt("Informe a data final do vinculo:", toInputDate(new Date()));
  if (endDate === null) {
    return;
  }

  if (!endDate || new Date(`${endDate}T00:00:00`) < new Date(`${assignment.data_inicio}T00:00:00`)) {
    showToast("Informe uma data final valida.");
    return;
  }

  const { error } = await supabaseClient
    .from("caminhao_motoristas")
    .update({
      data_fim: endDate,
      ativo: false,
      updated_by: profile.id
    })
    .eq("id", id);

  if (error) {
    showToast(error.message || "Nao foi possivel encerrar o vinculo.");
    return;
  }

  if (assignment.tipo === "principal") {
    await updateTruckResponsibleDriver(assignment.caminhao_id, null);
  }

  showToast("Vinculo encerrado.");
  await loadVinculos();
  await loadCaminhoes();
}

async function updateTruckResponsibleDriver(truckId, motoristaId) {
  const profile = getCurrentProfile();
  const { error } = await supabaseClient
    .from("caminhoes")
    .update({
      motorista_responsavel_id: motoristaId,
      updated_by: profile.id
    })
    .eq("id", truckId);

  if (error) {
    showToast("Vinculo salvo, mas nao foi possivel atualizar o motorista responsavel do caminhao.");
  }
}

async function syncResponsibleAssignment(truckId, motoristaId) {
  const profile = getCurrentProfile();
  const today = toInputDate(new Date());

  if (!motoristaId) {
    await closeActivePrincipalAssignments(truckId, today);
    return;
  }

  const closed = await closeActivePrincipalAssignments(truckId, today);
  if (!closed) {
    return;
  }

  const { error } = await supabaseClient
    .from("caminhao_motoristas")
    .insert({
      empresa_id: profile.empresa_id,
      caminhao_id: truckId,
      motorista_id: motoristaId,
      data_inicio: today,
      tipo: "principal",
      observacoes: "Vinculo criado pela ficha do caminhao.",
      ativo: true,
      created_by: profile.id,
      updated_by: profile.id
    });

  if (error) {
    showToast("Caminhao salvo, mas o historico do motorista nao foi registrado. Execute o SQL do historico se ainda nao rodou.");
  }
}

async function toggleTruck(truck) {
  if (!canWriteTrucks()) {
    showToast("Apenas administrador pode alterar status do caminhao.");
    return;
  }

  const profile = getCurrentProfile();
  const nextActive = !truck.ativo;
  const { error } = await supabaseClient
    .from("caminhoes")
    .update({
      ativo: nextActive,
      status: nextActive ? "disponivel" : "inativo",
      updated_by: profile.id
    })
    .eq("id", truck.id);

  if (error) {
    showToast(error.message || "Nao foi possivel alterar o status do caminhao.");
    return;
  }

  showToast(truck.ativo ? "Caminhao inativado." : "Caminhao reativado.");
  await loadCaminhoes();
}

function getFilteredCaminhoes() {
  const term = normalize(truckState.searchTerm);
  if (!term) {
    return truckState.caminhoes;
  }

  return truckState.caminhoes.filter((truck) =>
    [truck.nome, truck.placa, truck.status, getMotoristaName(truck.motorista_responsavel_id)]
      .some((value) => normalize(value).includes(term))
  );
}

function getSelectedTruck() {
  return truckState.caminhoes.find((truck) => truck.id === truckState.selectedTruckId) || null;
}

function canWriteTrucks() {
  return canManageCompany(getCurrentProfile());
}

function canWriteTruckAssignments() {
  return canManageTruckAssignments(getCurrentProfile());
}

function getAssignmentsForTruck(truckId) {
  return truckState.vinculos
    .filter((assignment) => assignment.caminhao_id === truckId)
    .sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));
}

function getActiveAssignment(truckId) {
  return getAssignmentsForTruck(truckId).find((assignment) => assignment.ativo && assignment.tipo === "principal") || null;
}

function getMotoristaOptions() {
  return [
    ["", "Sem motorista responsavel"],
    ...truckState.motoristas.map((motorista) => [motorista.id, motorista.nome])
  ];
}

function getRequiredMotoristaOptions() {
  return truckState.motoristas.map((motorista) => [motorista.id, motorista.nome]);
}

function getMotoristaName(motoristaId) {
  return truckState.motoristas.find((motorista) => motorista.id === motoristaId)?.nome || "";
}

function formatAssignmentType(type) {
  return assignmentTypes.find(([value]) => value === type)?.[1] || "Principal";
}

function updateCountLabel(text) {
  const label = document.querySelector("#caminhoes-count");
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

function optionalNumber(formData, field) {
  const value = optionalText(formData, field);
  return value === null ? null : Number(value);
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

function formatTruckStatus(status) {
  return truckStatuses.find(([value]) => value === status)?.[1] || "Status";
}

function getStatusClass(truck) {
  if (!truck.ativo || truck.status === "inativo") {
    return "inactive";
  }

  if (truck.status === "manutencao") {
    return "warning";
  }

  if (truck.status === "em_rota") {
    return "info";
  }

  return "active";
}

function formatLiters(value) {
  return `${Number(value || 0).toLocaleString("pt-BR")} L`;
}

function formatKm(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function formatDecimal(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function toInputDate(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function previousDate(value) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return toInputDate(date);
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
      <h2 class="panel-title">Caminhoes</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
