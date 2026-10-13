/* Service worker do Visualizador de Manhwa.
   Guarda só a "casca" do app (HTML, CSS, JS, ícones) para abrir rápido e sem internet.
   Os capítulos NÃO passam por aqui.

   >>> A cada publicação que mudar qualquer arquivo abaixo, aumente o número de VERSAO. <<<
*/
const VERSAO = 2;
const CACHE = `manhwa-v${VERSAO}`;

// Sem estes o app não abre: se algum falhar, a instalação do service worker falha de propósito.
const ESSENCIAIS = [
  "./",
  "index.html",
  "assets/styles/style.css",
  "assets/js/script.js",
  "assets/js/library.js",
  "assets/js/vendor/jszip.min.js",
];
// Enfeites e ícones: se algum faltar, o app continua funcionando.
const OPCIONAIS = [
  "manifest.webmanifest",
  "frog.svg",
  "grain.gif",
  "favicon.ico",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(ESSENCIAIS);
      await Promise.all(OPCIONAIS.map((u) => c.add(u).catch(() => {})));
    })
  );
  // Sem skipWaiting aqui: a versão nova espera o leitor tocar em "Atualizar",
  // para nunca trocar o app no meio de uma leitura.
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("manhwa-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "atualizar") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // Cache primeiro: abre na hora, mesmo com internet fraca ou sem internet.
  e.respondWith(
    caches.match(r, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(r).catch(() => (r.mode === "navigate" ? caches.match("index.html") : Response.error()));
    })
  );
});
