// Service worker: o que faz o app abrir sem internet e continuar lendo no metrô.
//
// Duas políticas. O que é do app (código, estilo, fontes) é servido do cache e atualizado por
// baixo, porque nunca vale esperar a rede para abrir. O catálogo de livros vai à rede primeiro,
// porque um livro novo empurrado por push precisa aparecer no mesmo dia.

const VERSAO = "gabinete-v1";
const ESSENCIAIS = [
  "./",
  "./index.html",
  "./estilo.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/texto.js",
  "./js/quiz.js",
  "./js/treino.js",
  "./js/dados.js",
  "./js/leitor.js",
  "./js/som.js",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      // Um arquivo que falhe não pode impedir a instalação inteira.
      .then((cache) => Promise.allSettled(ESSENCIAIS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  const url = new URL(pedido.url);
  const mesmaOrigem = url.origin === self.location.origin;
  const ehCatalogo = url.pathname.endsWith("/livros/index.json");

  if (ehCatalogo) {
    evento.respondWith(redePrimeiro(pedido));
    return;
  }

  if (mesmaOrigem || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com")) {
    evento.respondWith(cachePrimeiro(pedido));
  }
});

async function cachePrimeiro(pedido) {
  const guardado = await caches.match(pedido);
  const daRede = fetch(pedido)
    .then(async (resposta) => {
      if (resposta.ok) {
        const cache = await caches.open(VERSAO);
        cache.put(pedido, resposta.clone());
      }
      return resposta;
    })
    .catch(() => guardado);

  return guardado ?? daRede;
}

async function redePrimeiro(pedido) {
  try {
    const resposta = await fetch(pedido);
    if (resposta.ok) {
      const cache = await caches.open(VERSAO);
      cache.put(pedido, resposta.clone());
    }
    return resposta;
  } catch {
    const guardado = await caches.match(pedido);
    if (guardado) return guardado;
    throw new Error("sem rede e sem cópia guardada");
  }
}
