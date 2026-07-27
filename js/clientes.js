import { renderConnectionStatus } from "./offline.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const customerState = {
  clientes: [],
  locais: [],
  selectedClientId: null,
  searchTerm: "",
  showInactive: false,
  clientFormMode: null,
  locationFormMode: null,
  isLoading: false
};

const customerTypes = [
  ["pessoa_fisica", "Pessoa fisica"],
  ["pessoa_juridica", "Pessoa juridica"],
  ["condominio", "Condominio"],
  ["empresa", "Empresa"],
  ["orgao_publico", "Orgao publico"],
  ["outro", "Outro"]
];

export async function renderClientesPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para listar clientes.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  renderShell();
  bindShellEvents();
  await loadClientes();
}

function renderShell() {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Clientes</strong>
          <div id="clientes-count">Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="toolbar">
          <div class="field search-field">
            <label for="clientes-search">Buscar</label>
            <input id="clientes-search" type="search" placeholder="Nome, telefone, CPF ou CNPJ" value="${escapeAttribute(customerState.searchTerm)}">
          </div>
          <label class="check-control">
            <input id="clientes-show-inactive" type="checkbox" ${customerState.showInactive ? "checked" : ""}>
            Mostrar inativos
          </label>
          <button class="button" type="button" id="new-client-button">Novo cliente</button>
        </div>
      </section>

      <div id="client-form-container"></div>

      <section class="clientes-layout">
        <div class="panel list-panel">
          <h2 class="panel-title">Clientes cadastrados</h2>
          <div class="list" id="clientes-list">
            <div class="empty-state">Carregando clientes...</div>
          </div>
        </div>

        <div class="detail-column" id="cliente-detail">
          <section class="panel">
            <h2 class="panel-title">Detalhes</h2>
            <div class="empty-state">Selecione um cliente.</div>
          </section>
        </div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function bindShellEvents() {
  document.querySelector("#clientes-search")?.addEventListener("input", (event) => {
    customerState.searchTerm = event.target.value;
    renderClientesList();
  });

  document.querySelector("#clientes-show-inactive")?.addEventListener("change", async (event) => {
    customerState.showInactive = event.target.checked;
    await loadClientes();
  });

  document.querySelector("#new-client-button")?.addEventListener("click", () => {
    customerState.clientFormMode = "new";
    renderClientForm();
  });
}

async function loadClientes() {
  const profile = getCurrentProfile();
  customerState.isLoading = true;
  updateCountLabel("Carregando...");

  let query = supabaseClient
    .from("clientes")
    .select("id, nome, telefone, email, cpf_cnpj, endereco, ponto_referencia, latitude, longitude, observacoes, tipo, ativo, created_at")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });

  if (!customerState.showInactive) {
    query = query.eq("ativo", true);
  }

  const { data, error } = await query;
  customerState.isLoading = false;

  if (error) {
    showToast(error.message || "Nao foi possivel carregar clientes.");
    document.querySelector("#clientes-list").innerHTML = `<div class="empty-state">Erro ao carregar clientes.</div>`;
    updateCountLabel("Erro");
    return;
  }

  customerState.clientes = data || [];

  if (!customerState.selectedClientId || !customerState.clientes.some((cliente) => cliente.id === customerState.selectedClientId)) {
    customerState.selectedClientId = customerState.clientes[0]?.id || null;
  }

  renderClientesList();
  await renderSelectedClient();
}

function renderClientesList() {
  const list = document.querySelector("#clientes-list");
  if (!list) {
    return;
  }

  const clientes = getFilteredClientes();
  updateCountLabel(`${clientes.length} cliente${clientes.length === 1 ? "" : "s"}`);

  if (customerState.isLoading) {
    list.innerHTML = `<div class="empty-state">Carregando clientes...</div>`;
    return;
  }

  if (!clientes.length) {
    list.innerHTML = `<div class="empty-state">Nenhum cliente encontrado.</div>`;
    return;
  }

  list.innerHTML = clientes
    .map((cliente) => `
      <button class="list-item list-button ${cliente.id === customerState.selectedClientId ? "selected" : ""}" type="button" data-client-id="${cliente.id}">
        <span class="item-main">
          <strong>${escapeHtml(cliente.nome)}</strong>
          <span>${escapeHtml(cliente.telefone || "Sem telefone")}</span>
          <span>${escapeHtml(cliente.cpf_cnpj || "Sem CPF/CNPJ")}</span>
        </span>
        <span class="status-pill ${cliente.ativo ? "active" : "inactive"}">${cliente.ativo ? "Ativo" : "Inativo"}</span>
      </button>
    `)
    .join("");

  list.querySelectorAll("[data-client-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      customerState.selectedClientId = button.dataset.clientId;
      customerState.clientFormMode = null;
      customerState.locationFormMode = null;
      renderClientesList();
      await renderSelectedClient();
    });
  });
}

async function renderSelectedClient() {
  const detail = document.querySelector("#cliente-detail");
  if (!detail) {
    return;
  }

  const cliente = getSelectedClient();
  if (!cliente) {
    detail.innerHTML = `
      <section class="panel">
        <h2 class="panel-title">Detalhes</h2>
        <div class="empty-state">Selecione um cliente.</div>
      </section>
    `;
    return;
  }

  detail.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2 class="panel-title">${escapeHtml(cliente.nome)}</h2>
          <p class="field-hint">${formatCustomerType(cliente.tipo)} · ${cliente.ativo ? "Ativo" : "Inativo"}</p>
        </div>
        <div class="inline-actions">
          <button class="ghost-button compact-button" type="button" id="edit-client-button">Editar</button>
          <button class="ghost-button compact-button danger-text" type="button" id="toggle-client-button">${cliente.ativo ? "Inativar" : "Reativar"}</button>
        </div>
      </div>

      <dl class="details-list">
        <div><dt>Telefone</dt><dd>${escapeHtml(cliente.telefone || "-")}</dd></div>
        <div><dt>CPF/CNPJ</dt><dd>${escapeHtml(cliente.cpf_cnpj || "-")}</dd></div>
        <div><dt>E-mail</dt><dd>${escapeHtml(cliente.email || "-")}</dd></div>
        <div><dt>Endereco</dt><dd>${escapeHtml(cliente.endereco || "-")}</dd></div>
        <div><dt>Referencia</dt><dd>${escapeHtml(cliente.ponto_referencia || "-")}</dd></div>
        <div><dt>Observacoes</dt><dd>${escapeHtml(cliente.observacoes || "-")}</dd></div>
      </dl>

      <div class="button-row">
        ${buildMapLink(cliente.latitude, cliente.longitude, cliente.endereco)}
        ${buildWhatsAppLink(cliente.telefone, cliente.nome)}
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <h2 class="panel-title">Locais de entrega</h2>
        <button class="button compact-button" type="button" id="new-location-button">Novo local</button>
      </div>
      <div id="location-form-container"></div>
      <div class="list" id="locais-list">
        <div class="empty-state">Carregando locais...</div>
      </div>
    </section>
  `;

  document.querySelector("#edit-client-button")?.addEventListener("click", () => {
    customerState.clientFormMode = cliente.id;
    renderClientForm();
  });

  document.querySelector("#toggle-client-button")?.addEventListener("click", async () => {
    await toggleCliente(cliente);
  });

  document.querySelector("#new-location-button")?.addEventListener("click", () => {
    customerState.locationFormMode = "new";
    renderLocationForm();
  });

  await loadLocais(cliente.id);
}

async function loadLocais(clienteId) {
  const profile = getCurrentProfile();
  const list = document.querySelector("#locais-list");

  const { data, error } = await supabaseClient
    .from("locais_entrega")
    .select("id, nome, endereco, latitude, longitude, ponto_referencia, informacoes_acesso, quantidade_reservatorios, capacidade_total_litros, distancia_mangueira_metros, observacoes, ativo")
    .eq("empresa_id", profile.empresa_id)
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: true });

  if (error) {
    showToast(error.message || "Nao foi possivel carregar locais.");
    if (list) {
      list.innerHTML = `<div class="empty-state">Erro ao carregar locais.</div>`;
    }
    return;
  }

  customerState.locais = data || [];
  renderLocaisList();
}

function renderLocaisList() {
  const list = document.querySelector("#locais-list");
  if (!list) {
    return;
  }

  if (!customerState.locais.length) {
    list.innerHTML = `<div class="empty-state">Nenhum local cadastrado para este cliente.</div>`;
    return;
  }

  list.innerHTML = customerState.locais
    .map((local) => `
      <article class="list-item">
        <div class="panel-heading">
          <div>
            <strong>${escapeHtml(local.nome || "Local de entrega")}</strong>
            <span>${escapeHtml(local.endereco)}</span>
          </div>
          <span class="status-pill ${local.ativo ? "active" : "inactive"}">${local.ativo ? "Ativo" : "Inativo"}</span>
        </div>
        <dl class="details-list compact-details">
          <div><dt>Referencia</dt><dd>${escapeHtml(local.ponto_referencia || "-")}</dd></div>
          <div><dt>Acesso</dt><dd>${escapeHtml(local.informacoes_acesso || "-")}</dd></div>
          <div><dt>Reservatorios</dt><dd>${local.quantidade_reservatorios || 1} · ${formatLiters(local.capacidade_total_litros)}</dd></div>
          <div><dt>Mangueira</dt><dd>${local.distancia_mangueira_metros ? `${local.distancia_mangueira_metros} m` : "-"}</dd></div>
        </dl>
        <div class="button-row">
          ${buildMapLink(local.latitude, local.longitude, local.endereco)}
          <button class="ghost-button compact-button" type="button" data-edit-location="${local.id}">Editar</button>
          <button class="ghost-button compact-button danger-text" type="button" data-toggle-location="${local.id}">${local.ativo ? "Inativar" : "Reativar"}</button>
        </div>
      </article>
    `)
    .join("");

  list.querySelectorAll("[data-edit-location]").forEach((button) => {
    button.addEventListener("click", () => {
      customerState.locationFormMode = button.dataset.editLocation;
      renderLocationForm();
    });
  });

  list.querySelectorAll("[data-toggle-location]").forEach((button) => {
    button.addEventListener("click", async () => {
      const local = customerState.locais.find((item) => item.id === button.dataset.toggleLocation);
      if (local) {
        await toggleLocal(local);
      }
    });
  });
}

function renderClientForm() {
  const container = document.querySelector("#client-form-container");
  if (!container) {
    return;
  }

  const isEdit = customerState.clientFormMode && customerState.clientFormMode !== "new";
  const cliente = isEdit ? customerState.clientes.find((item) => item.id === customerState.clientFormMode) : {};

  container.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <h2 class="panel-title">${isEdit ? "Editar cliente" : "Novo cliente"}</h2>
        <button class="ghost-button compact-button" type="button" id="cancel-client-form">Cancelar</button>
      </div>
      <form class="form" id="client-form">
        <div class="form-grid">
          ${inputField("nome", "Nome", cliente?.nome, "text", true)}
          ${inputField("telefone", "Telefone", cliente?.telefone, "tel")}
          ${inputField("cpf_cnpj", "CPF ou CNPJ", cliente?.cpf_cnpj)}
          ${inputField("email", "E-mail", cliente?.email, "email")}
          ${selectField("tipo", "Tipo de cliente", cliente?.tipo || "pessoa_fisica", customerTypes)}
          ${inputField("endereco", "Endereco", cliente?.endereco)}
          ${inputField("ponto_referencia", "Ponto de referencia", cliente?.ponto_referencia)}
          ${inputField("latitude", "Latitude", cliente?.latitude, "number", false, "0.0000001")}
          ${inputField("longitude", "Longitude", cliente?.longitude, "number", false, "0.0000001")}
        </div>
        ${textareaField("observacoes", "Observacoes", cliente?.observacoes)}
        <button class="button" type="submit">${isEdit ? "Salvar cliente" : "Cadastrar cliente"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-client-form")?.addEventListener("click", () => {
    customerState.clientFormMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#client-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCliente(new FormData(event.currentTarget), cliente);
  });
}

function renderLocationForm() {
  const container = document.querySelector("#location-form-container");
  if (!container) {
    return;
  }

  const isEdit = customerState.locationFormMode && customerState.locationFormMode !== "new";
  const local = isEdit ? customerState.locais.find((item) => item.id === customerState.locationFormMode) : {};

  container.innerHTML = `
    <section class="nested-panel">
      <div class="panel-heading">
        <h3>${isEdit ? "Editar local" : "Novo local"}</h3>
        <button class="ghost-button compact-button" type="button" id="cancel-location-form">Cancelar</button>
      </div>
      <form class="form" id="location-form">
        <div class="form-grid">
          ${inputField("nome", "Nome do local", local?.nome)}
          ${inputField("endereco", "Endereco", local?.endereco, "text", true)}
          ${inputField("ponto_referencia", "Ponto de referencia", local?.ponto_referencia)}
          ${inputField("latitude", "Latitude GPS", local?.latitude, "number", false, "0.0000001")}
          ${inputField("longitude", "Longitude GPS", local?.longitude, "number", false, "0.0000001")}
          ${inputField("quantidade_reservatorios", "Quantidade de reservatorios", local?.quantidade_reservatorios || 1, "number", true, "1")}
          ${inputField("capacidade_total_litros", "Capacidade total em litros", local?.capacidade_total_litros, "number", false, "1")}
          ${inputField("distancia_mangueira_metros", "Distancia da mangueira em metros", local?.distancia_mangueira_metros, "number", false, "1")}
        </div>
        ${textareaField("informacoes_acesso", "Informacoes de acesso", local?.informacoes_acesso)}
        ${textareaField("observacoes", "Observacoes", local?.observacoes)}
        <button class="button" type="submit">${isEdit ? "Salvar local" : "Cadastrar local"}</button>
      </form>
    </section>
  `;

  document.querySelector("#cancel-location-form")?.addEventListener("click", () => {
    customerState.locationFormMode = null;
    container.innerHTML = "";
  });

  document.querySelector("#location-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveLocal(new FormData(event.currentTarget), local);
  });
}

async function saveCliente(formData, existingCliente = {}) {
  const profile = getCurrentProfile();
  const payload = {
    nome: requiredText(formData, "nome", "Informe o nome do cliente."),
    telefone: optionalText(formData, "telefone"),
    cpf_cnpj: optionalText(formData, "cpf_cnpj"),
    email: optionalText(formData, "email"),
    tipo: String(formData.get("tipo") || "pessoa_fisica"),
    endereco: optionalText(formData, "endereco"),
    ponto_referencia: optionalText(formData, "ponto_referencia"),
    latitude: optionalNumber(formData, "latitude"),
    longitude: optionalNumber(formData, "longitude"),
    observacoes: optionalText(formData, "observacoes"),
    updated_by: profile.id
  };

  if (!payload.nome) {
    return;
  }

  const isEdit = Boolean(existingCliente?.id);
  const query = isEdit
    ? supabaseClient.from("clientes").update(payload).eq("id", existingCliente.id)
    : supabaseClient.from("clientes").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        created_by: profile.id
      });

  const { error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o cliente.");
    return;
  }

  showToast(isEdit ? "Cliente atualizado." : "Cliente cadastrado.");
  customerState.clientFormMode = null;
  document.querySelector("#client-form-container").innerHTML = "";
  await loadClientes();
}

async function saveLocal(formData, existingLocal = {}) {
  const profile = getCurrentProfile();
  const cliente = getSelectedClient();
  if (!cliente) {
    showToast("Selecione um cliente antes de cadastrar o local.");
    return;
  }

  const payload = {
    nome: optionalText(formData, "nome"),
    endereco: requiredText(formData, "endereco", "Informe o endereco do local."),
    ponto_referencia: optionalText(formData, "ponto_referencia"),
    latitude: optionalNumber(formData, "latitude"),
    longitude: optionalNumber(formData, "longitude"),
    quantidade_reservatorios: positiveInteger(formData, "quantidade_reservatorios", "Informe ao menos 1 reservatorio."),
    capacidade_total_litros: optionalInteger(formData, "capacidade_total_litros"),
    distancia_mangueira_metros: optionalInteger(formData, "distancia_mangueira_metros"),
    informacoes_acesso: optionalText(formData, "informacoes_acesso"),
    observacoes: optionalText(formData, "observacoes"),
    updated_by: profile.id
  };

  if (!payload.endereco || !payload.quantidade_reservatorios) {
    return;
  }

  const isEdit = Boolean(existingLocal?.id);
  const query = isEdit
    ? supabaseClient.from("locais_entrega").update(payload).eq("id", existingLocal.id)
    : supabaseClient.from("locais_entrega").insert({
        ...payload,
        empresa_id: profile.empresa_id,
        cliente_id: cliente.id,
        created_by: profile.id
      });

  const { error } = await query;
  if (error) {
    showToast(error.message || "Nao foi possivel salvar o local.");
    return;
  }

  showToast(isEdit ? "Local atualizado." : "Local cadastrado.");
  customerState.locationFormMode = null;
  document.querySelector("#location-form-container").innerHTML = "";
  await loadLocais(cliente.id);
}

async function toggleCliente(cliente) {
  const profile = getCurrentProfile();
  const { error } = await supabaseClient
    .from("clientes")
    .update({ ativo: !cliente.ativo, updated_by: profile.id })
    .eq("id", cliente.id);

  if (error) {
    showToast(error.message || "Nao foi possivel alterar o status do cliente.");
    return;
  }

  showToast(cliente.ativo ? "Cliente inativado." : "Cliente reativado.");
  await loadClientes();
}

async function toggleLocal(local) {
  const profile = getCurrentProfile();
  const cliente = getSelectedClient();
  const { error } = await supabaseClient
    .from("locais_entrega")
    .update({ ativo: !local.ativo, updated_by: profile.id })
    .eq("id", local.id);

  if (error) {
    showToast(error.message || "Nao foi possivel alterar o status do local.");
    return;
  }

  showToast(local.ativo ? "Local inativado." : "Local reativado.");
  await loadLocais(cliente.id);
}

function getFilteredClientes() {
  const term = normalize(customerState.searchTerm);
  if (!term) {
    return customerState.clientes;
  }

  return customerState.clientes.filter((cliente) =>
    [cliente.nome, cliente.telefone, cliente.cpf_cnpj, cliente.email, cliente.endereco]
      .some((value) => normalize(value).includes(term))
  );
}

function getSelectedClient() {
  return customerState.clientes.find((cliente) => cliente.id === customerState.selectedClientId) || null;
}

function updateCountLabel(text) {
  const label = document.querySelector("#clientes-count");
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
        ${options.map(([value, labelText]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${labelText}</option>`).join("")}
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

function buildWhatsAppLink(phone, name) {
  const digits = onlyDigits(phone);
  if (!digits) {
    return `<span class="ghost-button compact-button disabled-link">Sem WhatsApp</span>`;
  }

  const phoneNumber = digits.startsWith("55") ? digits : `55${digits}`;
  const message = encodeURIComponent(`Ola, ${name}. Tudo bem? Aqui e da Agua Clara Caminhao-Pipa.`);
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

function optionalNumber(formData, field) {
  const value = optionalText(formData, field);
  return value === null ? null : Number(value);
}

function optionalInteger(formData, field) {
  const value = optionalText(formData, field);
  return value === null ? null : Number.parseInt(value, 10);
}

function positiveInteger(formData, field, message) {
  const value = Number.parseInt(String(formData.get(field) || ""), 10);
  if (!Number.isInteger(value) || value <= 0) {
    showToast(message);
    return null;
  }
  return value;
}

function formatCustomerType(type) {
  return customerTypes.find(([value]) => value === type)?.[1] || "Cliente";
}

function formatLiters(value) {
  if (!value && value !== 0) {
    return "capacidade nao informada";
  }
  return `${Number(value).toLocaleString("pt-BR")} L`;
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
      <h2 class="panel-title">Clientes</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
