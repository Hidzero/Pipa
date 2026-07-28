import { requestPasswordReset } from "./auth.js";
import { renderConnectionStatus } from "./offline.js";
import { bindPagination, getPageItems, normalizePage, renderPagination } from "./pagination.js";
import { canManageEmployees, canManageTruckAssignments, canViewTeam, formatAccessLevel, formatOperationalRole, isSupervisor } from "./permissions.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const employeeState = {
  funcionarios: [],
  caminhoes: [],
  vinculos: [],
  supervisorLinks: [],
  selectedEmployeeId: null,
  currentPage: 1,
  searchTerm: "",
  showInactive: false,
  formMode: null,
  assignmentFormOpen: false,
  supervisorFormOpen: false,
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

const assignmentTypes = [
  ["principal", "Principal"],
  ["substituto", "Substituto"],
  ["temporario", "Temporario"]
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

  if (!canViewTeam(profile)) {
    renderUnavailable("Seu usuario nao possui permissao para visualizar equipe.");
    return;
  }

  renderShell();
  bindShellEvents();
  await Promise.all([loadCaminhoes(), loadVinculos(), loadSupervisorLinks()]);
  await loadFuncionarios();
}

function renderShell() {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>${canManageEmployees(getCurrentProfile()) ? "Funcionarios" : "Minha equipe"}</strong>
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
          ${canManageEmployees(getCurrentProfile()) ? `<button class="button" type="button" id="new-employee-button">Novo funcionario</button>` : ""}
        </div>
      </section>

      <div id="employee-form-container"></div>

      <section class="resource-layout">
        <div class="panel list-panel">
          <h2 class="panel-title">${canManageEmployees(getCurrentProfile()) ? "Equipe cadastrada" : "Minha equipe"}</h2>
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

  employeeState.funcionarios = filterEmployeesForProfile((data || []).map(normalizeEmployee));

  if (!employeeState.selectedEmployeeId || !employeeState.funcionarios.some((funcionario) => funcionario.id === employeeState.selectedEmployeeId)) {
    employeeState.selectedEmployeeId = employeeState.funcionarios[0]?.id || null;
  }

  renderFuncionariosList();
  renderSelectedEmployee();
}

async function loadCaminhoes() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("caminhoes")
    .select("id, nome, placa, motorista_responsavel_id, status, ativo")
    .eq("empresa_id", profile.empresa_id)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    employeeState.caminhoes = [];
    showToast(error.message || "Nao foi possivel carregar caminhoes.");
    return;
  }

  employeeState.caminhoes = data || [];
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
    employeeState.vinculos = [];
    showToast("Historico motorista x caminhao indisponivel. Execute o SQL supabase/caminhao-motoristas.sql.");
    return;
  }

  employeeState.vinculos = data || [];
}

async function loadSupervisorLinks() {
  const profile = getCurrentProfile();
  const { data, error } = await supabaseClient
    .from("supervisor_funcionarios")
    .select("id, supervisor_id, funcionario_id, data_inicio, data_fim, observacoes, ativo, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("data_inicio", { ascending: false })
    .limit(1000);

  if (error) {
    employeeState.supervisorLinks = [];
    showToast("Historico supervisor x funcionario indisponivel. Execute o SQL supabase/supervisor-equipes.sql.");
    return;
  }

  employeeState.supervisorLinks = data || [];
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
          <span>${escapeHtml(formatEmployeeSummary(funcionario))}</span>
        </span>
        <span class="status-pill ${funcionario.ativo ? "active" : "inactive"}">${funcionario.ativo ? "Ativo" : "Inativo"}</span>
      </button>
    `)
    .join("") + renderPagination(funcionarios.length, employeeState.currentPage);

  list.querySelectorAll("[data-employee-id]").forEach((button) => {
    button.addEventListener("click", () => {
      employeeState.selectedEmployeeId = button.dataset.employeeId;
      employeeState.formMode = null;
      employeeState.assignmentFormOpen = false;
      employeeState.supervisorFormOpen = false;
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

  const isDriver = funcionario.funcao === "motorista";
  const activeAssignment = getActiveDriverAssignment(funcionario.id);
  const currentSupervisor = getActiveSupervisorLink(funcionario.id);
  const canManagePeople = canManageEmployees(getCurrentProfile());

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(funcionario.nome)}</h2>
          <p class="field-hint">${escapeHtml(formatAccessLevel(funcionario))} · ${escapeHtml(formatOperationalRole(funcionario))}</p>
        </div>
        ${canManagePeople ? `<div class="inline-actions">
          <button class="ghost-button compact-button" type="button" id="resend-access-button">Reenviar acesso</button>
          <button class="ghost-button compact-button" type="button" id="edit-employee-button">Editar</button>
          <button class="ghost-button compact-button danger-text" type="button" id="toggle-employee-button">${funcionario.ativo ? "Inativar" : "Reativar"}</button>
        </div>` : ""}
      </div>

      <dl class="details-list">
        <div><dt>E-mail</dt><dd>${escapeHtml(funcionario.email || "-")}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(funcionario.telefone || "-")}</dd></div>
        <div><dt>Nivel de acesso</dt><dd>${escapeHtml(formatAccessLevel(funcionario))}</dd></div>
        <div><dt>Funcao operacional</dt><dd>${escapeHtml(formatOperationalRole(funcionario))}</dd></div>
        ${funcionario.nivel_acesso === "funcionario" ? `<div><dt>Supervisor atual</dt><dd>${escapeHtml(currentSupervisor ? getEmployeeName(currentSupervisor.supervisor_id) : "-")}</dd></div>` : ""}
        ${isDriver ? `<div><dt>Caminhao atual</dt><dd>${escapeHtml(activeAssignment ? getTruckLabel(activeAssignment.caminhao_id) : "-")}</dd></div>` : ""}
        <div><dt>Status</dt><dd>${funcionario.ativo ? "Ativo" : "Inativo"}</dd></div>
        <div><dt>ID do usuario</dt><dd>${escapeHtml(funcionario.id)}</dd></div>
      </dl>
    </section>

    ${isDriver ? renderDriverTruckHistory(funcionario) : ""}
    ${renderSupervisorSection(funcionario)}
  `;

  document.querySelector("#edit-employee-button")?.addEventListener("click", () => {
    employeeState.formMode = funcionario.id;
    renderEmployeeForm();
  });

  document.querySelector("#toggle-employee-button")?.addEventListener("click", async () => {
    await toggleEmployee(funcionario);
  });

  document.querySelector("#resend-access-button")?.addEventListener("click", async () => {
    await resendEmployeeAccess(funcionario);
  });

  document.querySelector("#new-driver-assignment-button")?.addEventListener("click", () => {
    employeeState.assignmentFormOpen = true;
    renderSelectedEmployee();
  });

  document.querySelector("#cancel-driver-assignment-form")?.addEventListener("click", () => {
    employeeState.assignmentFormOpen = false;
    renderSelectedEmployee();
  });

  document.querySelector("#driver-assignment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveDriverAssignment(funcionario, new FormData(event.currentTarget));
  });

  document.querySelectorAll("[data-end-driver-assignment]").forEach((button) => {
    button.addEventListener("click", async () => {
      await endDriverAssignment(button.dataset.endDriverAssignment);
    });
  });

  document.querySelector("#new-supervisor-link-button")?.addEventListener("click", () => {
    employeeState.supervisorFormOpen = true;
    renderSelectedEmployee();
  });

  document.querySelector("#cancel-supervisor-link-form")?.addEventListener("click", () => {
    employeeState.supervisorFormOpen = false;
    renderSelectedEmployee();
  });

  document.querySelector("#supervisor-link-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveSupervisorLink(funcionario, new FormData(event.currentTarget));
  });

  document.querySelectorAll("[data-end-supervisor-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      await endSupervisorLink(button.dataset.endSupervisorLink);
    });
  });
}

function renderDriverTruckHistory(funcionario) {
  const assignments = getAssignmentsForDriver(funcionario.id);
  const form = employeeState.assignmentFormOpen ? renderDriverAssignmentForm() : "";
  const canWriteAssignments = canManageTruckAssignments(getCurrentProfile());

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">Caminhoes do motorista</h2>
          <p class="field-hint">Historico completo de qual caminhao ficou com este funcionario.</p>
        </div>
        ${canWriteAssignments ? `<button class="button compact-button" type="button" id="new-driver-assignment-button">Novo vinculo</button>` : ""}
      </div>
      ${form}
      ${assignments.length ? `
        <div class="list">
          ${assignments.map((assignment) => `
            <article class="list-item">
              <div class="panel-heading compact-heading">
                <div>
                  <strong>${escapeHtml(getTruckLabel(assignment.caminhao_id))}</strong>
                  <span>${formatAssignmentType(assignment.tipo)} · ${formatDate(assignment.data_inicio)} ate ${assignment.data_fim ? formatDate(assignment.data_fim) : "atual"}</span>
                </div>
                <span class="status-pill ${assignment.ativo ? "active" : "inactive"}">${assignment.ativo ? "Ativo" : "Encerrado"}</span>
              </div>
              <dl class="details-list compact-details">
                <div><dt>Observacoes</dt><dd>${escapeHtml(assignment.observacoes || "-")}</dd></div>
              </dl>
              ${assignment.ativo && canWriteAssignments ? `
                <div class="inline-actions">
                  <button class="ghost-button compact-button danger-text" type="button" data-end-driver-assignment="${assignment.id}">Encerrar vinculo</button>
                </div>
              ` : ""}
            </article>
          `).join("")}
        </div>
      ` : `<div class="empty-state">Nenhum caminhao vinculado a este motorista.</div>`}
    </section>
  `;
}

function renderSupervisorSection(funcionario) {
  const profile = getCurrentProfile();
  const canManagePeople = canManageEmployees(profile);

  if (funcionario.nivel_acesso === "administrador") {
    return "";
  }

  if (funcionario.nivel_acesso === "supervisor") {
    const supervisedTeam = getTeamForSupervisor(funcionario.id);
    return `
      <section class="panel">
        <h2 class="panel-title">Equipe supervisionada</h2>
        ${supervisedTeam.length ? renderSupervisedTeam(supervisedTeam) : `<div class="empty-state">Nenhum funcionario vinculado a este supervisor.</div>`}
      </section>
    `;
  }

  const links = getSupervisorLinksForEmployee(funcionario.id);
  const form = employeeState.supervisorFormOpen ? renderSupervisorLinkForm(funcionario) : "";

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">Supervisor responsavel</h2>
          <p class="field-hint">Historico de acompanhamento deste funcionario.</p>
        </div>
        ${canManagePeople ? `<button class="button compact-button" type="button" id="new-supervisor-link-button">Novo supervisor</button>` : ""}
      </div>
      ${form}
      ${links.length ? `
        <div class="list">
          ${links.map((link) => `
            <article class="list-item">
              <div class="panel-heading compact-heading">
                <div>
                  <strong>${escapeHtml(getEmployeeName(link.supervisor_id))}</strong>
                  <span>${formatDate(link.data_inicio)} ate ${link.data_fim ? formatDate(link.data_fim) : "atual"}</span>
                </div>
                <span class="status-pill ${link.ativo ? "active" : "inactive"}">${link.ativo ? "Ativo" : "Encerrado"}</span>
              </div>
              <dl class="details-list compact-details">
                <div><dt>Observacoes</dt><dd>${escapeHtml(link.observacoes || "-")}</dd></div>
              </dl>
              ${link.ativo && canManagePeople ? `
                <div class="inline-actions">
                  <button class="ghost-button compact-button danger-text" type="button" data-end-supervisor-link="${link.id}">Encerrar supervisor</button>
                </div>
              ` : ""}
            </article>
          `).join("")}
        </div>
      ` : `<div class="empty-state">Nenhum supervisor vinculado a este funcionario.</div>`}
    </section>
  `;
}

function renderSupervisorLinkForm(funcionario) {
  return `
    <section class="nested-panel">
      <div class="panel-heading">
        <h3>Novo supervisor</h3>
        <button class="ghost-button compact-button" type="button" id="cancel-supervisor-link-form">Cancelar</button>
      </div>
      <form class="form" id="supervisor-link-form">
        <div class="form-grid">
          ${selectField("supervisor_id", "Supervisor", "", getSupervisorOptions(funcionario.id))}
          ${inputField("data_inicio", "Inicio", toInputDate(new Date()), "date", true)}
        </div>
        ${textareaField("observacoes", "Observacoes")}
        <button class="button" type="submit">Salvar supervisor</button>
      </form>
    </section>
  `;
}

function renderSupervisedTeam(team) {
  if (!team.length) {
    return "";
  }

  return `
    <div class="nested-panel">
      <div class="list">
        ${team.map((employee) => `
          <article class="list-item">
            <strong>${escapeHtml(employee.nome)}</strong>
            <span>${escapeHtml(formatOperationalRole(employee))}</span>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderDriverAssignmentForm() {
  return `
    <section class="nested-panel">
      <div class="panel-heading">
        <h3>Novo vinculo</h3>
        <button class="ghost-button compact-button" type="button" id="cancel-driver-assignment-form">Cancelar</button>
      </div>
      <form class="form" id="driver-assignment-form">
        <div class="form-grid">
          ${selectField("caminhao_id", "Caminhao", "", getTruckOptions())}
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

  showToast("Funcionario criado. Use Reenviar acesso se quiser que ele defina nova senha.");
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

async function resendEmployeeAccess(funcionario) {
  if (!navigator.onLine) {
    showToast("Reenvio de acesso precisa de internet.");
    return;
  }

  if (!funcionario.email) {
    showToast("Este funcionario nao possui e-mail cadastrado.");
    return;
  }

  const confirmed = window.confirm(`Enviar e-mail de redefinicao de senha para ${funcionario.email}?`);
  if (!confirmed) {
    return;
  }

  try {
    await requestPasswordReset(funcionario.email);
    showToast("E-mail de acesso enviado.");
  } catch (error) {
    showToast(error.message || "Nao foi possivel reenviar o acesso.");
  }
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

async function saveDriverAssignment(funcionario, formData) {
  if (!canManageTruckAssignments(getCurrentProfile())) {
    showToast("Seu usuario nao possui permissao para vincular caminhoes.");
    return;
  }

  if (!navigator.onLine) {
    showToast("Vinculo motorista x caminhao precisa de internet.");
    return;
  }

  const profile = getCurrentProfile();
  const caminhaoId = requiredText(formData, "caminhao_id", "Selecione o caminhao.");
  const dataInicio = requiredText(formData, "data_inicio", "Informe a data inicial.");
  const dataFim = optionalText(formData, "data_fim");
  const tipo = String(formData.get("tipo") || "principal");

  if (!caminhaoId || !dataInicio) {
    return;
  }

  if (dataFim && new Date(`${dataFim}T00:00:00`) < new Date(`${dataInicio}T00:00:00`)) {
    showToast("A data final nao pode ser anterior ao inicio.");
    return;
  }

  if (tipo === "principal") {
    const closed = await closeActivePrincipalAssignments(funcionario.id, caminhaoId, dataInicio);
    if (!closed) {
      return;
    }
  }

  const { error } = await supabaseClient
    .from("caminhao_motoristas")
    .insert({
      empresa_id: profile.empresa_id,
      caminhao_id: caminhaoId,
      motorista_id: funcionario.id,
      data_inicio: dataInicio,
      data_fim: dataFim,
      tipo,
      observacoes: optionalText(formData, "observacoes"),
      ativo: !dataFim,
      created_by: profile.id,
      updated_by: profile.id
    });

  if (error) {
    showToast(error.message || "Nao foi possivel salvar o vinculo.");
    return;
  }

  if (tipo === "principal" && !dataFim) {
    await updateTruckResponsibleDriver(caminhaoId, funcionario.id);
  }

  showToast("Vinculo registrado.");
  employeeState.assignmentFormOpen = false;
  await Promise.all([loadCaminhoes(), loadVinculos()]);
  renderFuncionariosList();
  renderSelectedEmployee();
}

async function closeActivePrincipalAssignments(motoristaId, caminhaoId, nextStartDate) {
  const profile = getCurrentProfile();
  const endDate = previousDate(nextStartDate);
  const activeAssignments = employeeState.vinculos.filter((assignment) =>
    assignment.tipo === "principal" &&
    assignment.ativo &&
    (assignment.motorista_id === motoristaId || assignment.caminhao_id === caminhaoId)
  );

  for (const assignment of activeAssignments) {
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

    const truck = getTruckById(assignment.caminhao_id);
    if (truck?.motorista_responsavel_id === assignment.motorista_id) {
      await updateTruckResponsibleDriver(assignment.caminhao_id, null);
    }
  }

  return true;
}

async function endDriverAssignment(id) {
  if (!canManageTruckAssignments(getCurrentProfile())) {
    showToast("Seu usuario nao possui permissao para encerrar vinculos.");
    return;
  }

  if (!navigator.onLine) {
    showToast("Encerrar vinculo precisa de internet.");
    return;
  }

  const profile = getCurrentProfile();
  const assignment = employeeState.vinculos.find((item) => item.id === id);
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

  const truck = getTruckById(assignment.caminhao_id);
  if (assignment.tipo === "principal" && truck?.motorista_responsavel_id === assignment.motorista_id) {
    await updateTruckResponsibleDriver(assignment.caminhao_id, null);
  }

  showToast("Vinculo encerrado.");
  await Promise.all([loadCaminhoes(), loadVinculos()]);
  renderFuncionariosList();
  renderSelectedEmployee();
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

async function saveSupervisorLink(funcionario, formData) {
  if (!canManageEmployees(getCurrentProfile())) {
    showToast("Apenas administrador pode vincular supervisores.");
    return;
  }

  if (!navigator.onLine) {
    showToast("Vinculo supervisor x funcionario precisa de internet.");
    return;
  }

  const profile = getCurrentProfile();
  const supervisorId = requiredText(formData, "supervisor_id", "Selecione o supervisor.");
  const dataInicio = requiredText(formData, "data_inicio", "Informe a data inicial.");

  if (!supervisorId || !dataInicio) {
    return;
  }

  const closed = await closeActiveSupervisorLinks(funcionario.id, dataInicio);
  if (!closed) {
    return;
  }

  const { error } = await supabaseClient
    .from("supervisor_funcionarios")
    .insert({
      empresa_id: profile.empresa_id,
      supervisor_id: supervisorId,
      funcionario_id: funcionario.id,
      data_inicio: dataInicio,
      observacoes: optionalText(formData, "observacoes"),
      ativo: true,
      created_by: profile.id,
      updated_by: profile.id
    });

  if (error) {
    showToast(error.message || "Nao foi possivel salvar o supervisor.");
    return;
  }

  showToast("Supervisor vinculado.");
  employeeState.supervisorFormOpen = false;
  await loadSupervisorLinks();
  renderFuncionariosList();
  renderSelectedEmployee();
}

async function closeActiveSupervisorLinks(funcionarioId, nextStartDate) {
  const profile = getCurrentProfile();
  const endDate = previousDate(nextStartDate);
  const activeLinks = employeeState.supervisorLinks.filter((link) =>
    link.funcionario_id === funcionarioId &&
    link.ativo
  );

  for (const link of activeLinks) {
    const safeEndDate = new Date(`${endDate}T00:00:00`) < new Date(`${link.data_inicio}T00:00:00`)
      ? link.data_inicio
      : endDate;

    const { error } = await supabaseClient
      .from("supervisor_funcionarios")
      .update({
        data_fim: safeEndDate,
        ativo: false,
        updated_by: profile.id
      })
      .eq("id", link.id);

    if (error) {
      showToast(error.message || "Nao foi possivel encerrar supervisor anterior.");
      return false;
    }
  }

  return true;
}

async function endSupervisorLink(id) {
  if (!canManageEmployees(getCurrentProfile())) {
    showToast("Apenas administrador pode encerrar supervisor.");
    return;
  }

  if (!navigator.onLine) {
    showToast("Encerrar supervisor precisa de internet.");
    return;
  }

  const profile = getCurrentProfile();
  const link = employeeState.supervisorLinks.find((item) => item.id === id);
  if (!link) {
    return;
  }

  const endDate = window.prompt("Informe a data final do supervisor:", toInputDate(new Date()));
  if (endDate === null) {
    return;
  }

  if (!endDate || new Date(`${endDate}T00:00:00`) < new Date(`${link.data_inicio}T00:00:00`)) {
    showToast("Informe uma data final valida.");
    return;
  }

  const { error } = await supabaseClient
    .from("supervisor_funcionarios")
    .update({
      data_fim: endDate,
      ativo: false,
      updated_by: profile.id
    })
    .eq("id", id);

  if (error) {
    showToast(error.message || "Nao foi possivel encerrar o supervisor.");
    return;
  }

  showToast("Supervisor encerrado.");
  await loadSupervisorLinks();
  renderFuncionariosList();
  renderSelectedEmployee();
}

function normalizeEmployee(funcionario) {
  return {
    ...funcionario,
    nivel_acesso: funcionario.nivel_acesso || (funcionario.funcao === "administrador" ? "administrador" : "funcionario"),
    cargo: funcionario.cargo || funcionario.funcao
  };
}

function filterEmployeesForProfile(funcionarios) {
  const profile = getCurrentProfile();
  if (!isSupervisor(profile)) {
    return funcionarios;
  }

  const allowedIds = new Set([
    profile.id,
    ...employeeState.supervisorLinks
      .filter((link) => link.supervisor_id === profile.id && link.ativo)
      .map((link) => link.funcionario_id)
  ]);

  return funcionarios.filter((funcionario) => allowedIds.has(funcionario.id));
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

function getEmployeeById(employeeId) {
  return employeeState.funcionarios.find((funcionario) => funcionario.id === employeeId) || null;
}

function getEmployeeName(employeeId) {
  return getEmployeeById(employeeId)?.nome || "Funcionario";
}

function formatEmployeeSummary(funcionario) {
  const base = `${formatAccessLevel(funcionario)} · ${formatOperationalRole(funcionario)}`;
  if (funcionario.funcao !== "motorista") {
    return base;
  }

  const activeAssignment = getActiveDriverAssignment(funcionario.id);
  return activeAssignment ? `${base} · ${getTruckLabel(activeAssignment.caminhao_id)}` : `${base} · Sem caminhao`;
}

function getAssignmentsForDriver(driverId) {
  return employeeState.vinculos
    .filter((assignment) => assignment.motorista_id === driverId)
    .sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));
}

function getActiveDriverAssignment(driverId) {
  return getAssignmentsForDriver(driverId).find((assignment) => assignment.ativo && assignment.tipo === "principal") || null;
}

function getSupervisorLinksForEmployee(employeeId) {
  return employeeState.supervisorLinks
    .filter((link) => link.funcionario_id === employeeId)
    .sort((a, b) => new Date(b.data_inicio) - new Date(a.data_inicio));
}

function getActiveSupervisorLink(employeeId) {
  return getSupervisorLinksForEmployee(employeeId).find((link) => link.ativo) || null;
}

function getTeamForSupervisor(supervisorId) {
  const employeeIds = new Set(
    employeeState.supervisorLinks
      .filter((link) => link.supervisor_id === supervisorId && link.ativo)
      .map((link) => link.funcionario_id)
  );

  return employeeState.funcionarios
    .filter((funcionario) => employeeIds.has(funcionario.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function getTruckById(truckId) {
  return employeeState.caminhoes.find((truck) => truck.id === truckId) || null;
}

function getTruckLabel(truckId) {
  const truck = getTruckById(truckId);
  return truck ? `${truck.nome} · ${truck.placa}` : "Caminhao";
}

function getTruckOptions() {
  return [
    ["", "Selecione um caminhao"],
    ...employeeState.caminhoes.map((truck) => [truck.id, `${truck.nome} · ${truck.placa}`])
  ];
}

function getSupervisorOptions(currentEmployeeId) {
  const supervisors = employeeState.funcionarios
    .filter((funcionario) =>
      funcionario.id !== currentEmployeeId &&
      funcionario.nivel_acesso === "supervisor" &&
      funcionario.ativo
    )
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return [
    ["", "Selecione um supervisor"],
    ...supervisors.map((supervisor) => [supervisor.id, supervisor.nome])
  ];
}

function formatAssignmentType(type) {
  return assignmentTypes.find(([value]) => value === type)?.[1] || "Principal";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function toInputDate(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function previousDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return toInputDate(date);
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
