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
  return state.profile;
}

export function setOnlineStatus(isOnline) {
  state.isOnline = isOnline;
}
