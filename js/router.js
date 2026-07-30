import { signIn, requestPasswordReset, updatePassword } from "./auth.js";
import { renderAgendaPage } from "./agenda.js";
import { renderAuditoriaPage } from "./auditoria.js";
import { renderCaminhoesPage } from "./caminhoes.js";
import { renderClientesPage } from "./clientes.js";
import { renderConfiguracoesPage } from "./configuracoes.js";
import { renderDashboardPage } from "./dashboard.js";
import { renderFinanceiroPage } from "./financeiro.js";
import { renderFuncionariosPage } from "./funcionarios.js";
import { renderPedidosPage } from "./pedidos.js";
import { renderRelatoriosPage } from "./relatorios.js";
import { renderRotaPage } from "./rota.js";
import { renderSincronizacaoPage } from "./sincronizacao.js";
import { canAccessRouteByProfile } from "./permissions.js";
import { getCurrentProfile, getState } from "./state.js";
import { isSupabaseConfigured } from "./supabase.js";
import { renderNavigation, setActiveNav, setAuthenticatedLayout, setPageTitle, showToast } from "./ui.js";

const app = document.querySelector("#app");

const protectedRoutes = new Set(["/dashboard", "/clientes", "/funcionarios", "/caminhoes", "/pedidos", "/agenda", "/rota", "/financeiro", "/relatorios", "/auditoria", "/configuracoes", "/sincronizacao"]);

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

  if (state.session && protectedRoutes.has(route) && profile && !canAccessRouteByProfile(route, profile)) {
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
    renderDashboardPage();
  } else if (route === "/clientes") {
    renderClientesPage();
  } else if (route === "/funcionarios") {
    renderFuncionariosPage();
  } else if (route === "/caminhoes") {
    renderCaminhoesPage();
  } else if (route === "/pedidos") {
    renderPedidosPage();
  } else if (route === "/agenda") {
    renderAgendaPage();
  } else if (route === "/rota") {
    renderRotaPage();
  } else if (route === "/financeiro") {
    renderFinanceiroPage();
  } else if (route === "/relatorios") {
    renderRelatoriosPage();
  } else if (route === "/auditoria") {
    renderAuditoriaPage();
  } else if (route === "/configuracoes") {
    renderConfiguracoesPage();
  } else if (route === "/sincronizacao") {
    renderSincronizacaoPage();
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
