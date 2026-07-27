import { signIn, requestPasswordReset, updatePassword } from "./auth.js";
import { getCurrentProfile, getState } from "./state.js";
import { isSupabaseConfigured } from "./supabase.js";
import { renderConnectionStatus } from "./offline.js";
import { renderNavigation, setActiveNav, setAuthenticatedLayout, setPageTitle, showToast } from "./ui.js";

const app = document.querySelector("#app");

const routeAccess = {
  "/dashboard": ["administrador", "atendente", "motorista", "financeiro"],
  "/clientes": ["administrador", "atendente"],
  "/agenda": ["administrador", "atendente"],
  "/rota": ["administrador", "atendente", "motorista"],
  "/financeiro": ["administrador", "financeiro"]
};

const protectedRoutes = new Set(Object.keys(routeAccess));

export function getRoute() {
  const hash = window.location.hash.replace("#", "");
  if (hash.includes("type=recovery") || hash.startsWith("access_token=")) {
    return "/nova-senha";
  }

  return hash || "/dashboard";
}

export function navigate(route) {
  window.location.hash = route;
}

export function renderRoute() {
  const state = getState();
  const profile = getCurrentProfile();
  let route = getRoute();

  if (!state.session && protectedRoutes.has(route)) {
    route = "/login";
  }

  if (state.session && route === "/login") {
    route = "/dashboard";
  }

  if (state.session && protectedRoutes.has(route) && !profile) {
    route = "/sem-acesso";
  }

  if (state.session && protectedRoutes.has(route) && profile && !canAccessRoute(route, profile.funcao)) {
    route = "/sem-acesso";
  }

  setPageTitle(route);
  renderNavigation(profile);
  setActiveNav(route);
  setAuthenticatedLayout(Boolean(state.session && profile && route !== "/nova-senha"));

  if (route === "/login") {
    renderLogin();
  } else if (route === "/nova-senha") {
    renderNewPassword();
  } else if (route === "/dashboard") {
    renderDashboard();
  } else if (route === "/clientes") {
    renderPlaceholder("Clientes", "Cadastro de clientes e locais de entrega entra na etapa 4.");
  } else if (route === "/agenda") {
    renderPlaceholder("Agenda", "Pedidos, agenda e atribuicao de motorista entram na etapa 6.");
  } else if (route === "/rota") {
    renderPlaceholder("Rota do motorista", "Lista de entregas do dia e atalhos de mapa entram na etapa 7.");
  } else if (route === "/financeiro") {
    renderPlaceholder("Financeiro", "Pagamentos, recibos, combustivel e despesas entram nas etapas 9 e 10.");
  } else if (route === "/sem-acesso") {
    renderAccessDenied();
  } else {
    renderNotFound();
  }

  app?.focus();
}

function renderNewPassword() {
  app.innerHTML = `
    <section class="auth-layout">
      <div class="brand-panel">
        <h2>Crie uma nova senha</h2>
        <p>Depois de salvar, use a nova senha para acessar o sistema.</p>
      </div>

      <section class="panel" aria-labelledby="new-password-title">
        <h2 class="panel-title" id="new-password-title">Alterar senha</h2>
        <form class="form" id="new-password-form">
          <div class="field">
            <label for="new-password">Nova senha</label>
            <input id="new-password" name="new-password" type="password" autocomplete="new-password" required minlength="6" placeholder="Minimo de 6 caracteres">
          </div>

          <div class="field">
            <label for="new-password-confirmation">Confirmar senha</label>
            <input id="new-password-confirmation" name="new-password-confirmation" type="password" autocomplete="new-password" required minlength="6" placeholder="Digite novamente">
          </div>

          <button class="button" type="submit">Salvar nova senha</button>
        </form>
      </section>
    </section>
  `;

  document.querySelector("#new-password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("new-password") || "");
    const confirmation = String(formData.get("new-password-confirmation") || "");

    if (password !== confirmation) {
      showToast("As senhas nao conferem.");
      return;
    }

    try {
      await updatePassword(password);
      showToast("Senha atualizada. Entre novamente.");
      navigate("/login");
      renderRoute();
    } catch (error) {
      showToast(error.message || "Nao foi possivel alterar a senha.");
    }
  });
}

function renderLogin() {
  app.innerHTML = `
    <section class="auth-layout">
      <div class="brand-panel">
        <h2>Entregas de agua sem papelada</h2>
        <p>Controle pedidos, rotas, pagamentos e recibos em uma interface feita para celular.</p>
      </div>

      <section class="panel" aria-labelledby="login-title">
        <h2 class="panel-title" id="login-title">Acesse sua conta</h2>
        <form class="form" id="login-form">
          <div class="field">
            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com.br">
          </div>

          <div class="field">
            <label for="password">Senha</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="Sua senha">
            <p class="field-hint">${isSupabaseConfigured() ? "Use o login cadastrado no Supabase." : "Modo local ativo ate configurar o Supabase."}</p>
          </div>

          <div class="button-row">
            <button class="button" type="submit">Entrar</button>
            <button class="ghost-button" id="reset-password-button" type="button">Recuperar senha</button>
          </div>
        </form>
      </section>
    </section>
  `;

  document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      await signIn(email, password);
      showToast("Login realizado.");
      navigate("/dashboard");
      renderRoute();
    } catch (error) {
      showToast(error.message || "Nao foi possivel entrar.");
    }
  });

  document.querySelector("#reset-password-button")?.addEventListener("click", async () => {
    const email = document.querySelector("#email")?.value.trim();
    try {
      await requestPasswordReset(email);
      showToast(isSupabaseConfigured() ? "E-mail de recuperacao enviado." : "Configure o Supabase para enviar recuperacao de senha.");
    } catch (error) {
      showToast(error.message || "Nao foi possivel recuperar a senha.");
    }
  });
}

function renderDashboard() {
  const profile = getCurrentProfile();
  if (!profile) {
    renderAccessDenied();
    return;
  }

  const actions = getQuickActions(profile.funcao);

  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <div>
          <strong>${profile.nome}</strong>
          <div>${formatRole(profile.funcao)}</div>
        </div>
        <div>
          <span class="connection-status" id="connection-status">Online</span>
          <div id="pending-sync-count">0 pendentes</div>
        </div>
      </div>

      <section class="dashboard-grid" aria-label="Resumo do dia">
        <article class="card metric">
          <span>Entregas hoje</span>
          <strong>0</strong>
        </article>
        <article class="card metric">
          <span>Pedidos pendentes</span>
          <strong>0</strong>
        </article>
        <article class="card metric">
          <span>Recebido hoje</span>
          <strong>R$ 0</strong>
        </article>
        <article class="card metric">
          <span>Litros entregues</span>
          <strong>0</strong>
        </article>
      </section>

      <section class="panel">
        <h2 class="panel-title">Acoes rapidas</h2>
        <div class="quick-actions">
          ${actions.map((action) => `<a class="${action.className}" href="#${action.route}">${action.label}</a>`).join("")}
        </div>
      </section>

      <section class="panel">
        <h2 class="panel-title">Proximas entregas</h2>
        <div class="empty-state">Nenhuma entrega cadastrada nesta etapa.</div>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function renderPlaceholder(title, description) {
  app.innerHTML = `
    <section class="section-stack">
      <div class="status-bar">
        <span class="connection-status" id="connection-status">Online</span>
        <span id="pending-sync-count">0 pendentes</span>
      </div>
      <section class="panel">
        <h2 class="panel-title">${title}</h2>
        <p class="field-hint">${description}</p>
      </section>
    </section>
  `;

  renderConnectionStatus();
}

function renderNotFound() {
  app.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Pagina nao encontrada</h2>
      <a class="button" href="#/dashboard">Voltar ao painel</a>
    </section>
  `;
}

function renderAccessDenied() {
  app.innerHTML = `
    <section class="section-stack">
      <section class="panel">
        <h2 class="panel-title">Acesso indisponivel</h2>
        <p class="field-hint">Seu usuario nao possui perfil ativo ou permissao para esta area.</p>
        <div class="button-row">
          <a class="button" href="#/dashboard">Ir para o painel</a>
          <button class="ghost-button" type="button" id="access-help-button">Verificar acesso</button>
        </div>
      </section>
    </section>
  `;

  document.querySelector("#access-help-button")?.addEventListener("click", () => {
    showToast("Confira se este usuario esta vinculado na tabela perfis e se ativo = true.");
  });
}

function canAccessRoute(route, role) {
  return routeAccess[route]?.includes(role) || false;
}

function getQuickActions(role) {
  const actions = {
    administrador: [
      { route: "/clientes", label: "Novo cliente", className: "button" },
      { route: "/agenda", label: "Novo pedido", className: "secondary-button" },
      { route: "/rota", label: "Ver rota", className: "ghost-button" },
      { route: "/financeiro", label: "Financeiro", className: "ghost-button" }
    ],
    atendente: [
      { route: "/clientes", label: "Novo cliente", className: "button" },
      { route: "/agenda", label: "Novo pedido", className: "secondary-button" },
      { route: "/rota", label: "Ver rota", className: "ghost-button" }
    ],
    motorista: [
      { route: "/rota", label: "Ver entregas de hoje", className: "button" }
    ],
    financeiro: [
      { route: "/financeiro", label: "Ver financeiro", className: "button" }
    ]
  };

  return actions[role] || [];
}

function formatRole(role) {
  const labels = {
    administrador: "Administrador",
    atendente: "Atendente",
    motorista: "Motorista",
    financeiro: "Financeiro"
  };

  return labels[role] || "Usuario";
}
