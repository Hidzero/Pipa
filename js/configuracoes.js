import { loadCompanyContext } from "./empresa.js";
import { renderConnectionStatus } from "./offline.js";
import { canManageCompanySettings } from "./permissions.js";
import { getCurrentProfile } from "./state.js";
import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { showToast } from "./ui.js";

const app = document.querySelector("#app");

const settingsState = {
  empresa: null,
  mensagens: [],
  logoUrl: "",
  isLoading: false
};

const messageTypes = [
  ["confirmacao", "Confirmacao de pedido"],
  ["saida_entrega", "Saida para entrega"],
  ["recibo", "Envio de recibo"],
  ["cobranca", "Cobranca"]
];

export async function renderConfiguracoesPage() {
  if (!app) {
    return;
  }

  if (!isSupabaseConfigured()) {
    renderUnavailable("Configure o Supabase para carregar configuracoes.");
    return;
  }

  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    renderUnavailable("Perfil sem empresa vinculada.");
    return;
  }

  if (!canManageCompanySettings(profile)) {
    renderUnavailable("Apenas administrador pode editar configuracoes da empresa.");
    return;
  }

  renderLoading();
  await loadSettings();
  renderSettings();
}

function renderLoading() {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Configuracoes</strong>
          <div>Carregando...</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>
      <section class="panel">
        <div class="empty-state">Carregando configuracoes da empresa...</div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

async function loadSettings() {
  settingsState.isLoading = true;
  const profile = getCurrentProfile();

  const [empresaResult, mensagensResult] = await Promise.all([
    supabaseClient
      .from("empresas")
      .select("id, nome, nome_fantasia, documento, telefone, whatsapp_principal, email, endereco, logo_path, texto_recibo, observacoes_operacionais")
      .eq("id", profile.empresa_id)
      .single(),
    supabaseClient
      .from("mensagens_modelo")
      .select("id, tipo, titulo, texto, ativo")
      .eq("empresa_id", profile.empresa_id)
      .order("tipo", { ascending: true })
  ]);

  settingsState.isLoading = false;

  if (empresaResult.error) {
    showToast(empresaResult.error.message || "Nao foi possivel carregar empresa.");
    settingsState.empresa = null;
    return;
  }

  if (mensagensResult.error) {
    showToast(mensagensResult.error.message || "Nao foi possivel carregar mensagens.");
    settingsState.mensagens = [];
  }

  settingsState.empresa = empresaResult.data;
  settingsState.mensagens = normalizeMessages(mensagensResult.data || []);
  settingsState.logoUrl = await getLogoUrl(settingsState.empresa?.logo_path);
}

function renderSettings() {
  const empresa = settingsState.empresa;
  if (!empresa) {
    renderUnavailable("Empresa nao encontrada.");
    return;
  }

  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>Configuracoes</strong>
          <div>Empresa, recibo e mensagens</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2 class="panel-title">Dados da empresa</h2>
            <p class="field-hint">Essas informacoes aparecem em recibos e mensagens.</p>
          </div>
          ${settingsState.logoUrl ? `<img class="company-logo-preview" src="${settingsState.logoUrl}" alt="Logo da empresa">` : ""}
        </div>

        <form class="form" id="company-settings-form">
          <div class="form-grid">
            ${inputField("nome", "Razao social ou nome", empresa.nome, "text", true)}
            ${inputField("nome_fantasia", "Nome fantasia", empresa.nome_fantasia)}
            ${inputField("documento", "CNPJ ou CPF", empresa.documento)}
            ${inputField("telefone", "Telefone", empresa.telefone, "tel")}
            ${inputField("whatsapp_principal", "WhatsApp principal", empresa.whatsapp_principal, "tel")}
            ${inputField("email", "E-mail", empresa.email, "email")}
            ${inputField("endereco", "Endereco", empresa.endereco)}
            <div class="field">
              <label for="logo">Logo da empresa</label>
              <input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml">
              <p class="field-hint">${empresa.logo_path ? "Envie outro arquivo para substituir a logo atual." : "Opcional."}</p>
            </div>
          </div>
          ${textareaField("texto_recibo", "Texto padrao do recibo", empresa.texto_recibo)}
          ${textareaField("observacoes_operacionais", "Observacoes operacionais", empresa.observacoes_operacionais)}
          <button class="button" type="submit">Salvar configuracoes</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2 class="panel-title">Mensagens de WhatsApp</h2>
            <p class="field-hint">Use variaveis como {empresa}, {cliente}, {data}, {quantidade}, {valor}, {numero_entrega} e {recibo_url}.</p>
          </div>
        </div>
        <form class="form" id="message-settings-form">
          <div class="operations-grid">
            ${settingsState.mensagens.map((message) => renderMessageCard(message)).join("")}
          </div>
          <button class="button" type="submit">Salvar mensagens</button>
        </form>
      </section>
    </section>
  `;

  document.querySelector("#company-settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCompanySettings(new FormData(event.currentTarget));
  });

  document.querySelector("#message-settings-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveMessageSettings(new FormData(event.currentTarget));
  });

  renderConnectionStatus();
}

function renderMessageCard(message) {
  return `
    <section class="nested-panel">
      <h3>${escapeHtml(getMessageLabel(message.tipo))}</h3>
      ${inputField(`titulo_${message.tipo}`, "Titulo", message.titulo, "text", true)}
      ${textareaField(`texto_${message.tipo}`, "Mensagem", message.texto)}
      <label class="check-control">
        <input name="ativo_${message.tipo}" type="checkbox" ${message.ativo ? "checked" : ""}>
        Mensagem ativa
      </label>
    </section>
  `;
}

async function saveCompanySettings(formData) {
  if (!navigator.onLine) {
    showToast("Configuracoes da empresa precisam de internet.");
    return;
  }

  const profile = getCurrentProfile();
  const payload = {
    nome: requiredText(formData, "nome", "Informe o nome da empresa."),
    nome_fantasia: optionalText(formData, "nome_fantasia"),
    documento: optionalText(formData, "documento"),
    telefone: optionalText(formData, "telefone"),
    whatsapp_principal: optionalText(formData, "whatsapp_principal"),
    email: optionalText(formData, "email"),
    endereco: optionalText(formData, "endereco"),
    texto_recibo: optionalText(formData, "texto_recibo"),
    observacoes_operacionais: optionalText(formData, "observacoes_operacionais")
  };

  if (!payload.nome) {
    return;
  }

  const logoPath = await uploadLogo(formData);
  if (logoPath) {
    payload.logo_path = logoPath;
  }

  const { error } = await supabaseClient
    .from("empresas")
    .update(payload)
    .eq("id", profile.empresa_id);

  if (error) {
    showToast(error.message || "Nao foi possivel salvar configuracoes.");
    return;
  }

  showToast("Configuracoes salvas.");
  await loadCompanyContext(true);
  await loadSettings();
  renderSettings();
}

async function saveMessageSettings(formData) {
  if (!navigator.onLine) {
    showToast("Mensagens precisam de internet.");
    return;
  }

  const profile = getCurrentProfile();
  const payloads = settingsState.mensagens.map((message) => ({
    id: message.id || undefined,
    empresa_id: profile.empresa_id,
    tipo: message.tipo,
    titulo: requiredText(formData, `titulo_${message.tipo}`, "Informe o titulo da mensagem."),
    texto: requiredText(formData, `texto_${message.tipo}`, "Informe o texto da mensagem."),
    ativo: formData.get(`ativo_${message.tipo}`) === "on",
    updated_by: profile.id,
    created_by: profile.id
  }));

  if (payloads.some((payload) => !payload.titulo || !payload.texto)) {
    return;
  }

  const { error } = await supabaseClient
    .from("mensagens_modelo")
    .upsert(payloads, { onConflict: "empresa_id,tipo" });

  if (error) {
    showToast(error.message || "Nao foi possivel salvar mensagens.");
    return;
  }

  showToast("Mensagens salvas.");
  await loadCompanyContext(true);
  await loadSettings();
  renderSettings();
}

async function uploadLogo(formData) {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return "";
  }

  const profile = getCurrentProfile();
  const extension = getFileExtension(file.name, file.type);
  const path = `${profile.empresa_id}/logo-${Date.now()}.${extension}`;
  const { error } = await supabaseClient.storage
    .from("logos-empresas")
    .upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });

  if (error) {
    showToast(error.message || "Nao foi possivel enviar a logo.");
    return "";
  }

  return path;
}

async function getLogoUrl(path) {
  if (!path) {
    return "";
  }

  const { data, error } = await supabaseClient.storage
    .from("logos-empresas")
    .createSignedUrl(path, 3600);

  if (error) {
    return "";
  }

  return data?.signedUrl || "";
}

function normalizeMessages(messages) {
  return messageTypes.map(([type, label]) => {
    const message = messages.find((item) => item.tipo === type);
    return message || {
      tipo: type,
      titulo: label,
      texto: getDefaultMessage(type),
      ativo: true
    };
  });
}

function getDefaultMessage(type) {
  const defaults = {
    confirmacao: "Ola, {cliente}. Seu pedido de {quantidade} litros foi confirmado para {data}.",
    saida_entrega: "Ola, {cliente}. Nosso caminhao saiu para sua entrega de agua.",
    recibo: "Ola, {cliente}. Segue o recibo da entrega numero {numero_entrega}.",
    cobranca: "Ola, {cliente}. Identificamos um valor pendente de {valor}. Podemos ajudar com o pagamento?"
  };

  return defaults[type] || "";
}

function getMessageLabel(type) {
  return messageTypes.find(([value]) => value === type)?.[1] || type;
}

function inputField(name, label, value = "", type = "text", required = false) {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeAttribute(value ?? "")}" ${required ? "required" : ""}>
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

function getFileExtension(name, type) {
  const extension = String(name || "").split(".").pop();
  if (extension && extension !== name) {
    return extension.toLowerCase();
  }

  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/svg+xml") return "svg";
  return "jpg";
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
      <h2 class="panel-title">Configuracoes</h2>
      <p class="field-hint">${escapeHtml(message)}</p>
    </section>
  `;
}
