import { signIn, requestPasswordReset } from "./auth.js";
import { getCurrentProfile, getState } from "./state.js";
import { isSupabaseConfigured } from "./supabase.js";
import { renderConnectionStatus } from "./offline.js";
import { setActiveNav, setAuthenticatedLayout, setPageTitle, showToast } from "./ui.js";

const app = document.querySelector("#app");

const protectedRoutes = new Set(["/dashboard", "/clientes", "/agenda", "/rota", "/financeiro"]);

export function getRoute() {
  const hash = window.location.hash.replace("#", "");
  return hash || "/dashboard";
}

export function navigate(route) {
  window.location.hash = route;
}

export function renderRoute() {
  const state = getState();
  let route = getRoute();

  if (!state.session && protectedRoutes.has(route)) {
    route = "/login";
  }

  if (state.session && route === "/login") {
    route = "/dashboard";
  }

  setPageTitle(route);
  setActiveNav(route);
  setAuthenticatedLayout(Boolean(state.session));

  if (route === "/login") {
    renderLogin();
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
  } else {
    renderNotFound();
  }

  app?.focus();
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
          <a class="button" href="#/clientes">Novo cliente</a>
          <a class="secondary-button" href="#/agenda">Novo pedido</a>
          <a class="ghost-button" href="#/rota">Ver rota</a>
          <a class="ghost-button" href="#/financeiro">Financeiro</a>
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

function formatRole(role) {
  const labels = {
    administrador: "Administrador",
    atendente: "Atendente",
    motorista: "Motorista",
    financeiro: "Financeiro"
  };

  return labels[role] || "Usuario";
}
