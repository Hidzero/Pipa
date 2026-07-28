import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const validAccessLevels = new Set(["administrador", "supervisor", "funcionario"]);
const validRoles = new Set(["administrador", "atendente", "motorista", "financeiro"]);

type EmployeePayload = {
  nome: string;
  email: string;
  password: string;
  telefone: string | null;
  nivel_acesso: string;
  funcao: string;
  cargo: string;
  ativo: boolean;
};

type PayloadResult = EmployeePayload | { error: string };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo nao permitido." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Variaveis de ambiente do Supabase ausentes." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return jsonResponse({ error: "Sessao nao enviada." }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: "Sessao invalida." }, 401);
    }

    const { data: callerProfile, error: profileError } = await serviceClient
      .from("perfis")
      .select("id, empresa_id, nivel_acesso, ativo")
      .eq("id", userData.user.id)
      .eq("ativo", true)
      .single();

    if (profileError || callerProfile?.nivel_acesso !== "administrador") {
      return jsonResponse({ error: "Apenas administrador da empresa pode criar usuarios." }, 403);
    }

    const body = await req.json();
    const employee = parseEmployeePayload(body);
    if ("error" in employee) {
      return jsonResponse({ error: employee.error }, 400);
    }

    const { data: createdUser, error: createError } = await serviceClient.auth.admin.createUser({
      email: employee.email,
      password: employee.password,
      email_confirm: true,
      user_metadata: {
        nome: employee.nome,
        empresa_id: callerProfile.empresa_id
      }
    });

    if (createError || !createdUser.user) {
      return jsonResponse({ error: createError?.message || "Nao foi possivel criar o usuario." }, 400);
    }

    const profilePayload = {
      id: createdUser.user.id,
      empresa_id: callerProfile.empresa_id,
      nome: employee.nome,
      email: employee.email,
      telefone: employee.telefone,
      nivel_acesso: employee.nivel_acesso,
      funcao: employee.funcao,
      cargo: employee.cargo,
      ativo: employee.ativo
    };

    const { data: profile, error: insertError } = await serviceClient
      .from("perfis")
      .insert(profilePayload)
      .select("id, empresa_id, nome, email, telefone, funcao, nivel_acesso, cargo, ativo, created_at")
      .single();

    if (insertError) {
      await serviceClient.auth.admin.deleteUser(createdUser.user.id);
      return jsonResponse({ error: insertError.message || "Nao foi possivel criar o perfil." }, 400);
    }

    return jsonResponse({ funcionario: profile }, 200);
  } catch (error) {
    return jsonResponse({ error: error?.message || "Erro inesperado." }, 500);
  }
});

function parseEmployeePayload(body: Record<string, unknown>): PayloadResult {
  const nome = normalizeText(body.nome);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const telefone = normalizeText(body.telefone);
  const nivel_acesso = normalizeText(body.nivel_acesso) || "funcionario";
  const funcao = normalizeText(body.funcao) || "atendente";
  const cargo = normalizeText(body.cargo) || getDefaultCargo(nivel_acesso, funcao);
  const ativo = body.ativo !== false;

  if (!nome) {
    return { error: "Informe o nome do funcionario." };
  }

  if (!email || !email.includes("@")) {
    return { error: "Informe um e-mail valido." };
  }

  if (password.length < 6) {
    return { error: "A senha inicial precisa ter pelo menos 6 caracteres." };
  }

  if (!validAccessLevels.has(nivel_acesso)) {
    return { error: "Nivel de acesso invalido." };
  }

  if (!validRoles.has(funcao)) {
    return { error: "Funcao operacional invalida." };
  }

  return {
    nome,
    email,
    password,
    telefone,
    nivel_acesso,
    funcao,
    cargo,
    ativo
  };
}

function getDefaultCargo(nivel_acesso: string, funcao: string) {
  if (nivel_acesso === "administrador") {
    return "Administrador da empresa";
  }

  if (nivel_acesso === "supervisor") {
    return "Supervisor";
  }

  const labels: Record<string, string> = {
    atendente: "Atendente",
    motorista: "Motorista",
    financeiro: "Financeiro",
    administrador: "Administrador"
  };

  return labels[funcao] || "Funcionario";
}

function normalizeText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeEmail(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return text || null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
