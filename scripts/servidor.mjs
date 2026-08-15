// Servidor estático só para desenvolvimento. O app usa módulos ES e service worker, e nenhum dos
// dois funciona abrindo o arquivo direto pelo file:// — precisa de HTTP.
//
//   node scripts/servidor.mjs [porta]

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..", "web");
const PORTA = Number(process.argv[2] ?? 4173);

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

createServer(async (pedido, resposta) => {
  try {
    const url = new URL(pedido.url, `http://${pedido.headers.host}`);
    // Sem o normalize, "../" na URL sairia da pasta web e serviria qualquer arquivo do disco.
    const relativo = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let caminho = join(RAIZ, relativo);

    if (!caminho.startsWith(RAIZ)) {
      resposta.writeHead(403).end("fora da pasta do app");
      return;
    }

    const informacao = await stat(caminho).catch(() => null);
    if (informacao?.isDirectory()) caminho = join(caminho, "index.html");

    const conteudo = await readFile(caminho);
    resposta.writeHead(200, {
      "Content-Type": TIPOS[extname(caminho)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    resposta.end("não encontrado");
  }
}).listen(PORTA, () => {
  console.log(`Gabinete em http://localhost:${PORTA}`);
});
