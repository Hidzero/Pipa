const titleByRoute = {
  "/login": "Entrar",
  "/nova-senha": "Nova senha",
  "/dashboard": "Painel",
  "/clientes": "Clientes",
  "/caminhoes": "Caminhoes",
  "/pedidos": "Pedidos",
  "/agenda": "Agenda",
  "/rota": "Rota do motorista",
  "/financeiro": "Financeiro",
  "/sem-acesso": "Sem acesso"
};

const navigationItems = [
  { route: "/dashboard", label: "Inicio", roles: ["administrador", "atendente", "motorista", "financeiro"] },
  { route: "/clientes", label: "Clientes", roles: ["administrador", "atendente"] },
  { route: "/caminhoes", label: "Frota", roles: ["administrador"] },
  { route: "/pedidos", label: "Pedidos", roles: ["administrador", "atendente", "financeiro"] },
  { route: "/agenda", label: "Agenda", roles: ["administrador", "atendente"] },
  { route: "/rota", label: "Rota", roles: ["administrador", "atendente", "motorista"] },
  { route: "/financeiro", label: "Financeiro", roles: ["administrador", "financeiro"] }
];

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

export function renderNavigation(profile) {
  const nav = document.querySelector("#bottom-nav");
  if (!nav) {
    return;
  }

  if (!profile) {
    nav.innerHTML = "";
    return;
  }

  nav.innerHTML = navigationItems
    .filter((item) => item.roles.includes(profile.funcao))
    .map((item) => `<a href="#${item.route}" data-route="${item.route}">${item.label}</a>`)
    .join("");
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
