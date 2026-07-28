import { renderConnectionStatus } from "./offline.js";
import { bindPagination, getPageItems, normalizePage, renderPagination } from "./pagination.js";
import { canManageCompany, formatAccessLevel, formatOperationalRole } from "./permissions.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const employeeState = {
  funcionarios: [],
  selectedEmployeeId: null,
  currentPage: 1,
  searchTerm: "",
  showInactive: false,
  formMode: null,
  isLoading: false
};

const accessLevels = [
  ["funcionario", "Funcionario"],
  ["supervisor", "Supervisor"],
  ["administrador", "Administrador da empresa"]
];

const operationalRoles = [
  ["atendente", "Atendente"],
  ["motorista", "Motorista"],
  ["financeiro", "Financeiro"],
  ["administrador", "Administrador"]
];

export async function renderFuncionariosPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para gerenciar funcionarios.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  if (!canManageCompany(profile)) {
    renderUnavailable("Apenas administrador da empresa pode gerenciar funcionarios.");
    return;
  }

  renderShell();
  bindShellEvents();
  await loadFuncionarios();
}

function renderShell() {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Funcionarios</strong>
          <div id="funcionarios-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar">
          <div class="field search-field">
            <label for="funcionarios-search">Buscar</label>
            <input id="funcionarios-search" type="search" placeholder="Nome, e-mail, telefone ou cargo" value="${escapeAttribute(employeeState.searchTerm)}">
          </div>
          <label class="check-control">
            <input id="funcionarios-show-inactive" type="checkbox" ${employeeState.showInactive ? "checked" : ""}>
            Mostrar inativos
          </label>
          <button class="button" type="button" id="new-employee-button">Novo funcionario</button>
        </div>
      </section>

      <div id="employee-form-container"></div>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title">Equipe cadastrada</h2>
          <div class="list" id="funcionarios-list">
            <div class="empty-state">Carregando funcionarios...</div>
          </div>
        </div>

        <div class="detail-column" id="funcionario-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione um funcionario.</div>
          </section>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelector("#funcionarios-search")?.addEventListener("input", (event) => {
    employeeState.searchTerm = event.target.value;
    employeeState.currentPage = 1;
    renderFuncionariosList();
  });

  document.querySelector("#funcionarios-show-inactive")?.addEventListener("change", async (event) => {
    employeeState.showInactive = event.target.checked;
    await loadFuncionarios();
  });

  document.querySelector("#new-employee-button")?.addEventListener("click", () => {
    employeeState.formMode = "new";
    renderEmployeeForm();
  });
}

async function loadFuncionarios() {
  const profile = getCurrentProfile();
  employeeState.isLoading = true;
  updateCountLabel("Carregando...");

  let query = supabaseClient
    .from("perfis")
    .select("id, nome, email, telefone, funcao, nivel_acesso, cargo, ativo, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (!employeeState.showInactive) {
    query = query.eq("ativo", true);
  }

  const { data, error } = await query;
  employeeState.isLoading = false;

  if (error) {
    showToast(error.message || "Nao foi possivel carregar funcionarios.");
    document.querySelector("#funcionarios-list").innerHTML = `<div class="empty-state">Erro ao carregar funcionarios.</div>`;
    updateCountLabel("Erro");
    return;
  }

  employeeState.funcionarios = (data || []).map(normalizeEmployee);

  if (!employeeState.selectedEmployeeId || !employeeState.funcionarios.some((funcionario) => funcionario.id === employeeState.selectedEmployeeId)) {
    employeeState.selectedEmployeeId = employeeState.funcionarios[0]?.id || null;
  }

  renderFuncionariosList();
  renderSelectedEmployee();
}

function renderFuncionariosList() {
  const list = document.querySelector("#funcionarios-list");
  if (!list) {
    return;
  }

  const funcionarios = getFilteredFuncionarios();
  employeeState.currentPage = normalizePage(employeeState.currentPage, funcionarios.length);
  const pageFuncionarios = getPageItems(funcionarios, employeeState.currentPage);
  updateCountLabel(`${funcionarios.length} funcionario${funcionarios.length === 1 ? "" : "s"}`);

  if (employeeState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando funcionarios...</div>`;
    return;
  }

  if (!funcionarios.length) {
    list.innerHTML = `<div class="empty-state">Nenhum funcionario encontrado.</div>`;
    return;
  }

  list.innerHTML = pageFuncionarios
    .map((funcionario) => `
      <button class="list-item list-button ${funcionario.id === employeeState.selectedEmployeeId ? "selected" : ""}" type="button" data-employee-id="${funcionario.id}">
        <span class="item-main">
          <strong>${escapeHtml(funcionario.nome)}</strong>
          <span>${escapeHtml(funcionario.email || "Sem e-mail")}</span>
          <span>${escapeHtml(formatAccessLevel(funcionario))} · ${escapeHtml(formatOperationalRole(funcionario))}</span>
        </span>
        <span class="status-pill ${funcionario.ativo ? "active" : "inactive"}">${funcionario.ativo ? "Ativo" : "Inativo"}</span>
      </button>
    `)
    .join("") + renderPagination(funcionarios.length, employeeState.currentPage);

  list.querySelectorAll("[data-employee-id]").forEach((button) => {
    button.addEventListener("click", () => {
      employeeState.selectedEmployeeId = button.dataset.employeeId;
      employeeState.formMode = null;
      document.querySelector("#employee-form-container").innerHTML = "";
      renderFuncionariosList();
      renderSelectedEmployee();
    });
  });

  bindPagination(list, (page) => {
    employeeState.currentPage = page;
    renderFuncionariosList();
  });
}

function renderSelectedEmployee() {
  const detail = document.querySelector("#funcionario-detail");
  if (!detail) {
    return;
  }

  const funcionario = getSelectedEmployee();
  if (!funcionario) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione um funcionario.</div>
      </section>
    `;
    return;
  }

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(funcionario.nome)}</h2>
          <p class="field-hint">${escapeHtml(formatAccessLevel(funcionario))} · ${escapeHtml(formatOperationalRole(funcionario))}</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button compact-button" type="button" id="edit-employee-button">Editar</button>
          <button class="ghost-button compact-button danger-text" type="button" id="toggle-employee-button">${funcionario.ativo ? "Inativar" : "Reativar"}</button>
        </div>
      </div>

      <dl class="details-list">
        <div><dt>E-mail</dt><dd>${escapeHtml(funcionario.email || "-")}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(funcionario.telefone || "-")}</dd></div>
        <div><dt>Nivel de acesso</dt><dd>${escapeHtml(formatAccessLevel(funcionario))}</dd></div>
        <div><dt>Funcao operacional</dt><dd>${escapeHtml(formatOperationalRole(funcionario))}</dd></div>
        <div><dt>Status</dt><dd>${funcionario.ativo ? "Ativo" : "Inativo"}</dd></div>
        <div><dt>ID do usuario</dt><dd>${escapeHtml(funcionario.id)}</dd></div>
      </dl>
    </section>
  `;

  document.querySelector("#edit-employee-button")?.addEventListener("click", () => {
    employeeState.formMode = funcionario.id;
    renderEmployeeForm();
  });

  document.querySelector("#toggle-employee-button")?.addEventListener("click", async () => {
    await toggleEmployee(funcionario);
  });
}

function renderEmployeeForm() {
  const container = document.querySelector("#employee-form-container");
  if (!container) {
    return;
  }

  const isEdit = employeeState.formMode && employeeState.formMode !== "new";
  const funcionario = isEdit ? employeeState.funcionarios.find((item) => item.id === employeeState.formMode) : {};
  const selectedAccess = funcionario?.nivel_acesso || "funcionario";
  const selectedRole = funcionario?.funcao || "motorista";

  container.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <h2 class="panel-title">${isEdit ? "Editar funcionario" : "Novo funcionario"}</h2>
        <button class="ghost-button compact-button" type="button" id="cancel-employee-form">Cancelar</button>
      </div>
      <form class="form" id="employee-form">
        <div class="form-grid">
          ${inputField("nome", "Nome", funcionario?.nome, "text", true)}
          ${inputField("email", "E-mail de login", funcionario?.email, "email", !isEdit, "", isEdit)}
          ${isEdit ? "" : inputField("password", "Senha inicial", "", "password", true, "", false, "6")}
          ${inputField("telefone", "Telefone", funcionario?.telefone, "tel")}
          ${selectField("nivel_acesso", "Nivel de acesso", selectedAccess, accessLevels)}
          ${selectField("funcao", "Funcao operacional", selectedRole, operationalRoles)}
          ${inputField("cargo", "Cargo", funcionario?.cargo)}
          ${checkboxField("ativo", "Usuario ativo", funcionario?.ativo !== false)}
        </div>
        <button class="button" type="submit">${isEdit ? "Salvar funcionario" : "Criar usuario"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-employee-form")?.addEventListener("click", () => {
    employeeState.formMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#employee-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveEmployee(new FormData(event.currentTarget), funcionario);
  });
}

async function saveEmployee(formData, existingEmployee = {}) {
  if (!navigator.onLine) {
    showToast("Cadastro de funcionario precisa de internet.");
    return;
  }

  const payload = {
    nome: requiredText(formData, "nome", "Informe o nome do funcionario."),
    email: optionalText(formData, "email")?.toLowerCase() || null,
    password: optionalText(formData, "password"),
    telefone: optionalText(formData, "telefone"),
    nivel_acesso: String(formData.get("nivel_acesso") || "funcionario"),
    funcao: String(formData.get("funcao") || "motorista"),
    cargo: optionalText(formData, "cargo"),
    ativo: formData.get("ativo") === "on"
  };

  if (!payload.nome) {
    return;
  }

  if (existingEmployee?.id) {
    await updateEmployee(existingEmployee, payload);
    return;
  }

  if (!payload.email || !payload.email.includes("@")) {
    showToast("Informe um e-mail valido.");
    return;
  }

  if (!payload.password || payload.password.length < 6) {
    showToast("A senha inicial precisa ter pelo menos 6 caracteres.");
    return;
  }

  const { data, error } = await supabaseClient.functions.invoke("criar-funcionario", {
    body: payload
  });

  if (error || data?.error) {
    showToast(data?.error || error?.message || "Nao foi possivel criar o funcionario.");
    return;
  }

  showToast("Funcionario criado.");
  employeeState.formMode = null;
  document.querySelector("#employee-form-container").innerHTML = "";
  await loadFuncionarios();
}

async function updateEmployee(existingEmployee, payload) {
  const currentProfile = getCurrentProfile();
  if (existingEmployee.id === currentProfile.id && payload.ativo === false) {
    showToast("Voce nao pode inativar seu proprio usuario.");
    return;
  }

  const updatePayload = {
    nome: payload.nome,
    telefone: payload.telefone,
    nivel_acesso: payload.nivel_acesso,
    funcao: payload.funcao,
    cargo: payload.cargo,
    ativo: payload.ativo
  };

  const { error } = await supabaseClient
    .from("perfis")
    .update(updatePayload)
    .eq("id", existingEmployee.id);

  if (error) {
    showToast(error.message || "Nao foi possivel salvar o funcionario.");
    return;
  }

  showToast("Funcionario atualizado.");
  employeeState.formMode = null;
  document.querySelector("#employee-form-container").innerHTML = "";
  await loadFuncionarios();
}

async function toggleEmployee(funcionario) {
  const currentProfile = getCurrentProfile();
  if (funcionario.id === currentProfile.id && funcionario.ativo) {
    showToast("Voce nao pode inativar seu proprio usuario.");
    return;
  }

  const { error } = await supabaseClient
    .from("perfis")
    .update({ ativo: !funcionario.ativo })
    .eq("id", funcionario.id);

  if (error) {
    showToast(error.message || "Nao foi possivel alterar o status do funcionario.");
    return;
  }

  showToast(funcionario.ativo ? "Funcionario inativado." : "Funcionario reativado.");
  await loadFuncionarios();
}

function normalizeEmployee(funcionario) {
  return {
    ...funcionario,
    nivel_acesso: funcionario.nivel_acesso || (funcionario.funcao === "administrador" ? "administrador" : "funcionario"),
    cargo: funcionario.cargo || funcionario.funcao
  };
}

function getFilteredFuncionarios() {
  const term = normalize(employeeState.searchTerm);
  if (!term) {
    return employeeState.funcionarios;
  }

  return employeeState.funcionarios.filter((funcionario) =>
    [funcionario.nome, funcionario.email, funcionario.telefone, funcionario.cargo, funcionario.funcao, funcionario.nivel_acesso]
      .some((value) => normalize(value).includes(term))
  );
}

function getSelectedEmployee() {
  return employeeState.funcionarios.find((funcionario) => funcionario.id === employeeState.selectedEmployeeId) || null;
}

function updateCountLabel(text) {
  const label = document.querySelector("#funcionarios-count");
  if (label) {
    label.textContent = text;
  }
}

function inputField(name, label, value = "", type = "text", required = false, step = "", disabled = false, minlength = "") {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeAttribute(value ?? "")}" ${required ? "required" : ""} ${step ? `step="${step}"` : ""} ${disabled ? "disabled" : ""} ${minlength ? `minlength="${minlength}"` : ""}>
    </div>
  `;
}

function checkboxField(name, label, checked = false) {
  return `
    <label class="check-control">
      <input id="${name}" name="${name}" type="checkbox" ${checked ? "checked" : ""}>
      ${label}
    </label>
  `;
}

function selectField(name, label, selectedValue, options) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}" name="${name}">
        ${options.map(([value, labelText]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${labelText}</option>`).join("")}
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
      <h2 class="panel-title">Funcionarios</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
