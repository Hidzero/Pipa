export const APP_CONFIG = {
  productionUrl: "https://pipa-six.vercel.app/"
};

export function getAppBaseUrl() {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.protocol === "file:";

  if (isLocal) {
    return window.location.origin + window.location.pathname;
  }

  return APP_CONFIG.productionUrl;
}
