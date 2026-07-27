const DEFAULT_PROFILE = {
  id: "local-demo-user",
  nome: "Usuario local",
  funcao: "administrador",
  empresa_id: "local-demo-company"
};

const state = {
  session: null,
  profile: null,
  isOnline: navigator.onLine
};

export function getState() {
  return state;
}

export function setSession(session) {
  state.session = session;
}

export function setProfile(profile) {
  state.profile = profile;
}

export function getCurrentProfile() {
  return state.profile || DEFAULT_PROFILE;
}

export function setOnlineStatus(isOnline) {
  state.isOnline = isOnline;
}
