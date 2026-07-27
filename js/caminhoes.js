import { renderConnectionStatus } from "./offline.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const truckState = {
  caminhoes: [],
  motoristas: [],
  selectedTruckId: null,
  searchTerm: "",
  showInactive: false,
  formMode: null,
  isLoading: false
};

const truckStatuses = [
  ["disponivel", "Disponivel"],
  ["em_rota", "Em rota"],
  ["manutencao", "Manutencao"],
  ["inativo", "Inativo"]
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
  await Promise.all([loadMotoristas(), loadCaminhoes()]);
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
          <button class="button" type="button" id="new-truck-button">Novo caminhao</button>
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

function renderCaminhoesList() {
  const list = document.querySelector("#caminhoes-list");
  if (!list) {
    return;
  }

  const caminhoes = getFilteredCaminhoes();
  updateCountLabel(`${caminhoes.length} caminhao${caminhoes.length === 1 ? "" : "es"}`);

  if (truckState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando caminhoes...</div>`;
    return;
  }

  if (!caminhoes.length) {
    list.innerHTML = `<div class="empty-state">Nenhum caminhao encontrado.</div>`;
    return;
  }

  list.innerHTML = caminhoes
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
    .join("");

  list.querySelectorAll("[data-truck-id]").forEach((button) => {
    button.addEventListener("click", () => {
      truckState.selectedTruckId = button.dataset.truckId;
      truckState.formMode = null;
      renderCaminhoesList();
      renderSelectedTruck();
    });
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

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(truck.nome)}</h2>
          <p class="field-hint">${escapeHtml(truck.placa)} · ${formatTruckStatus(truck.status)} · ${truck.ativo ? "Ativo" : "Inativo"}</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button compact-button" type="button" id="edit-truck-button">Editar</button>
          <button class="ghost-button compact-button danger-text" type="button" id="toggle-truck-button">${truck.ativo ? "Inativar" : "Reativar"}</button>
        </div>
      </div>

      <dl class="details-list">
        <div><dt>Capacidade</dt><dd>${formatLiters(truck.capacidade_litros)}</dd></div>
        <div><dt>Quilometragem</dt><dd>${formatKm(truck.quilometragem)}</dd></div>
        <div><dt>Motorista responsavel</dt><dd>${escapeHtml(getMotoristaName(truck.motorista_responsavel_id) || "-")}</dd></div>
        <div><dt>Consumo medio</dt><dd>${truck.consumo_medio_km_l ? `${formatDecimal(truck.consumo_medio_km_l)} km/L` : "-"}</dd></div>
        <div><dt>Observacoes</dt><dd>${escapeHtml(truck.observacoes || "-")}</dd></div>
      </dl>
    </section>
  `;

  document.querySelector("#edit-truck-button")?.addEventListener("click", () => {
    truckState.formMode = truck.id;
    renderTruckForm();
  });

  document.querySelector("#toggle-truck-button")?.addEventListener("click", async () => {
    await toggleTruck(truck);
  });
}

function renderTruckForm() {
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
    ? supabaseClient.from("caminhoes").update(payload).eq("id", existingTruck.id)
    : supabaseClient.from("caminhoes").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      });

  const { error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o caminhao.");
    return;
  }

  showToast(isEdit ? "Caminhao atualizado." : "Caminhao cadastrado.");
  truckState.formMode = null;
  document.querySelector("#truck-form-container").innerHTML = "";
  await loadCaminhoes();
}

async function toggleTruck(truck) {
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

function getMotoristaOptions() {
  return [
    ["", "Sem motorista responsavel"],
    ...truckState.motoristas.map((motorista) => [motorista.id, motorista.nome])
  ];
}

function getMotoristaName(motoristaId) {
  return truckState.motoristas.find((motorista) => motorista.id === motoristaId)?.nome || "";
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
      <select id="${name}" name="${name}">
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
