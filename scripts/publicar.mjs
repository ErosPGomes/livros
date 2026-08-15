// Copia web/ para docs/, que é a pasta que o GitHub Pages serve.
//
// Manter as duas separadas evita o erro clássico de editar o que está no ar: web/ é a fonte, docs/
// é o resultado. Publicar é rodar este script, conferir o git status e dar push.
//
//   node scripts/publicar.mjs

import { cp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const ORIGEM = join(RAIZ, "web");
const DESTINO = join(RAIZ, "docs");
const DOMINIO = "livros.erosgomes.com.br";

await rm(DESTINO, { recursive: true, force: true });
await mkdir(DESTINO, { recursive: true });
await cp(ORIGEM, DESTINO, { recursive: true, filter: (caminho) => !caminho.includes(`${sep}livros`) });

// Só livro de domínio público vai para docs/. O que está no ar é público de verdade, então livro
// com direitos fica de fora e é servido pela Edge Function, atrás da senha.
const catalogo = JSON.parse(await readFile(join(ORIGEM, "livros", "index.json"), "utf8"));
const publicos = (catalogo.livros ?? []).filter((livro) => livro.dominioPublico === true);
const retidos = (catalogo.livros ?? []).length - publicos.length;

await mkdir(join(DESTINO, "livros"), { recursive: true });
await writeFile(
  join(DESTINO, "livros", "index.json"),
  JSON.stringify({ ...catalogo, livros: publicos }, null, 2) + "\n",
  "utf8",
);

for (const livro of publicos) {
  await cp(join(ORIGEM, "livros", livro.arquivo), join(DESTINO, "livros", livro.arquivo));
}

// O CNAME é o que amarra o domínio próprio ao Pages; sem ele, cada deploy derruba o domínio.
await writeFile(join(DESTINO, "CNAME"), `${DOMINIO}\n`, "utf8");

// Sem o .nojekyll o Pages roda o Jekyll e some com qualquer arquivo iniciado por underscore.
await writeFile(join(DESTINO, ".nojekyll"), "", "utf8");

console.log("docs/ atualizado a partir de web/");
console.log(`domínio: ${DOMINIO}`);
console.log(`livros publicados: ${publicos.length}`);
if (retidos > 0) {
  console.log(`livros retidos (não são domínio público): ${retidos} — envie-os com enviar-livro.mjs`);
}
