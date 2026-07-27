const titleByRoute = {
  "/login": "Entrar",
  "/dashboard": "Painel",
  "/clientes": "Clientes",
  "/agenda": "Agenda",
  "/rota": "Rota do motorista",
  "/financeiro": "Financeiro"
};

export function setPageTitle(route) {
  const pageTitle = document.querySelector("#page-title");
  if (pageTitle) {
    pageTitle.textContent = titleByRoute[route] || "Pipa Entregas";
  }
}

export function setAuthenticatedLayout(isAuthenticated) {
  document.querySelector(".topbar")?.setAttribute("data-authenticated", String(isAuthenticated));
  document.querySelector("#bottom-nav")?.classList.toggle("hidden", !isAuthenticated);
  document.querySelector("#logout-button")?.classList.toggle("hidden", !isAuthenticated);
}

export function setActiveNav(route) {
  document.querySelectorAll("[data-route]").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
}

export function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => toast.classList.add("hidden"), 3600);
}
