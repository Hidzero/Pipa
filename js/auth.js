import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
import { getAppBaseUrl } from "./config.js";
import { setProfile, setSession } from "./state.js";

const LOCAL_SESSION_KEY = "pipa.localSession";

export async function restoreSession() {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      console.warn("Falha ao restaurar sessao", error);
      return null;
    }

    setSession(data.session);
    if (data.session?.user) {
      const profile = await loadProfile(data.session.user.id);
      if (!profile) {
        await clearAuthState();
        return null;
      }
    }
    return data.session;
  }

  const localSession = localStorage.getItem(LOCAL_SESSION_KEY);
  if (!localSession) {
    return null;
  }

  const parsedSession = JSON.parse(localSession);
  setSession(parsedSession);
  setProfile(parsedSession.profile);
  return parsedSession;
}

export async function signIn(email, password) {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }

    setSession(data.session);
    const profile = await loadProfile(data.user.id);
    if (!profile) {
      await clearAuthState();
      throw new Error("Usuario autenticado, mas sem perfil ativo. Vincule este usuario na tabela perfis.");
    }
    return data.session;
  }

  if (!email || password.length < 6) {
    throw new Error("Informe e-mail e senha com pelo menos 6 caracteres.");
  }

  const localSession = {
    access_token: "local-demo-token",
    user: { id: "local-demo-user", email },
    profile: {
      id: "local-demo-user",
      nome: "Usuario local",
      funcao: "administrador",
      empresa_id: "local-demo-company"
    }
  };

  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(localSession));
  setSession(localSession);
  setProfile(localSession.profile);
  return localSession;
}

export async function signOut() {
  await clearAuthState();
}

async function clearAuthState() {
  if (isSupabaseConfigured()) {
    await supabaseClient.auth.signOut();
  }

  localStorage.removeItem(LOCAL_SESSION_KEY);
  setSession(null);
  setProfile(null);
}

export async function requestPasswordReset(email) {
  if (!email) {
    throw new Error("Informe o e-mail para recuperar a senha.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: getAppBaseUrl()
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePassword(newPassword) {
  if (!isSupabaseConfigured()) {
    throw new Error("Configure o Supabase para alterar senha.");
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message);
  }

  await clearAuthState();
}

async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("perfis")
    .select("id, nome, telefone, funcao, empresa_id, ativo")
    .eq("id", userId)
    .eq("ativo", true)
    .single();

  if (error) {
    console.warn("Perfil nao encontrado", error);
    setProfile(null);
    return null;
  }

  setProfile(data);
  return data;
}
