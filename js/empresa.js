import { getCurrentProfile } from "./state.js";
import { supabaseClient } from "./supabase.js";

let cachedEmpresaId = "";
let cachedContext = {
  empresa: null,
  mensagens: []
};

const defaultMessages = {
  contato: "Ola, {cliente}. Tudo bem? Aqui e da {empresa}.",
  confirmacao: "Ola, {cliente}. Seu pedido de {quantidade} litros foi confirmado para {data}.",
  saida_entrega: "Ola, {cliente}. Nosso caminhao saiu para sua entrega de agua.",
  recibo: "Ola, {cliente}. Segue o recibo da entrega numero {numero_entrega}.",
  cobranca: "Ola, {cliente}. Identificamos um valor pendente de {valor}. Podemos ajudar com o pagamento?"
};

export async function loadCompanyContext(force = false) {
  const profile = getCurrentProfile();
  if (!profile?.empresa_id) {
    return cachedContext;
  }

  if (!force && cachedEmpresaId === profile.empresa_id && cachedContext.empresa) {
    return cachedContext;
  }

  const [empresaResult, mensagensResult] = await Promise.all([
    supabaseClient
      .from("empresas")
      .select("id, nome, nome_fantasia, documento, telefone, whatsapp_principal, email, endereco, logo_path, texto_recibo, observacoes_operacionais")
      .eq("id", profile.empresa_id)
      .single(),
    supabaseClient
      .from("mensagens_modelo")
      .select("tipo, titulo, texto, ativo")
      .eq("empresa_id", profile.empresa_id)
      .eq("ativo", true)
  ]);

  cachedEmpresaId = profile.empresa_id;
  cachedContext = {
    empresa: empresaResult.data || null,
    mensagens: mensagensResult.data || []
  };

  return cachedContext;
}

export function getCompanyContext() {
  return cachedContext;
}

export function getCompanyDisplayName() {
  const empresa = cachedContext.empresa;
  return empresa?.nome_fantasia || empresa?.nome || "Pipa Entregas";
}

export function buildWhatsAppAnchor(phone, templateType, variables = {}, label = "WhatsApp") {
  const digits = onlyDigits(phone);
  if (!digits) {
    return `<span class="ghost-button compact-button disabled-link">Sem WhatsApp</span>`;
  }

  const phoneNumber = digits.startsWith("55") ? digits : `55${digits}`;
  const text = buildMessage(templateType, variables);
  return `<a class="ghost-button compact-button" target="_blank" rel="noopener" href="https://wa.me/${phoneNumber}?text=${encodeURIComponent(text)}">${escapeHtml(label)}</a>`;
}

export function buildMessage(templateType, variables = {}) {
  const template = cachedContext.mensagens.find((message) => message.tipo === templateType)?.texto
    || defaultMessages[templateType]
    || "";

  const empresa = cachedContext.empresa || {};
  const values = {
    empresa: getCompanyDisplayName(),
    empresa_telefone: empresa.telefone || "",
    empresa_whatsapp: empresa.whatsapp_principal || empresa.telefone || "",
    empresa_documento: empresa.documento || "",
    ...variables
  };

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function getReceiptCompanyData() {
  const empresa = cachedContext.empresa || {};
  return {
    nome: getCompanyDisplayName(),
    documento: empresa.documento || "",
    telefone: empresa.whatsapp_principal || empresa.telefone || "",
    email: empresa.email || "",
    endereco: empresa.endereco || "",
    textoRecibo: empresa.texto_recibo || "Obrigado pela preferencia."
  };
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
