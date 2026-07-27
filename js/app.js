import { restoreSession, signOut } from "./auth.js";
import { registerServiceWorker, setupConnectivityListeners } from "./offline.js";
import { navigate, renderRoute } from "./router.js";
import { showToast } from "./ui.js";

async function boot() {
  await registerServiceWorker();
  setupConnectivityListeners();
  await restoreSession();

  window.addEventListener("hashchange", renderRoute);
  document.querySelector("#logout-button")?.addEventListener("click", async () => {
    await signOut();
    showToast("Sessao encerrada.");
    navigate("/login");
    renderRoute();
  });

  renderRoute();
}

boot().catch((error) => {
  console.error(error);
  showToast("Nao foi possivel iniciar o aplicativo.");
});
