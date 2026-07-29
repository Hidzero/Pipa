import { canAccessRouteByProfile } from "./permissions.js";

const titleByRoute = {
  "/login": "Entrar",
  "/nova-senha": "Nova senha",
  "/dashboard": "Painel",
  "/clientes": "Clientes",
  "/funcionarios": "Funcionarios",
  "/caminhoes": "Caminhoes",
  "/pedidos": "Pedidos",
  "/agenda": "Agenda",
  "/rota": "Rota do motorista",
  "/financeiro": "Financeiro",
  "/relatorios": "Relatorios",
  "/auditoria": "Auditoria",
  "/sem-acesso": "Sem acesso"
};

const navigationItems = [
  { route: "/dashboard", label: "Inicio" },
  { route: "/clientes", label: "Clientes" },
  { route: "/funcionarios", label: "Equipe" },
  { route: "/caminhoes", label: "Frota" },
  { route: "/pedidos", label: "Pedidos" },
  { route: "/agenda", label: "Agenda" },
  { route: "/rota", label: "Rota" },
  { route: "/financeiro", label: "Financeiro" },
  { route: "/relatorios", label: "Relatorios" },
  { route: "/auditoria", label: "Auditoria" }
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
    .filter((item) => canAccessRouteByProfile(item.route, profile))
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
