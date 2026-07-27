import { supabaseClient, isSupabaseConfigured } from "./supabase.js";
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
      await loadProfile(data.session.user.id);
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
    await loadProfile(data.user.id);
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
    redirectTo: window.location.origin + window.location.pathname
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("perfis")
    .select("id, nome, funcao, empresa_id")
    .eq("id", userId)
    .single();

  if (error) {
    console.warn("Perfil nao encontrado", error);
    setProfile(null);
    return null;
  }

  setProfile(data);
  return data;
}
