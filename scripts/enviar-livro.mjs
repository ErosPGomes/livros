// Envia um livro para a nuvem, em vez de publicá-lo no repositório.
//
// É o caminho para livro com direitos: o arquivo nunca entra no Git, então não vira página pública.
// Ele fica na tabela do Supabase e só sai de lá pela Edge Function, para quem tem a senha.
//
//   set GABINETE_SENHA=sua-senha
//   node scripts/enviar-livro.mjs caminho/livro.md "Título" "Autor" [ano]

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const FUNCAO = "https://agsfaaertvwyrlqeywzn.supabase.co/functions/v1/gabinete";

const [, , arquivo, titulo, autor, ano] = process.argv;
const senha = process.env.GABINETE_SENHA;

if (!arquivo || !titulo) {
  console.error('uso: node scripts/enviar-livro.mjs livro.md "Título" "Autor" [ano]');
  process.exit(1);
}
if (!senha) {
  console.error("Defina a variável GABINETE_SENHA com a senha do app antes de enviar.");
  process.exit(1);
}

const texto = await readFile(arquivo, "utf8");
const id = basename(arquivo, extname(arquivo))
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const resposta = await fetch(`${FUNCAO}/livro`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "x-gabinete-senha": senha },
  body: JSON.stringify({ id, titulo, autor: autor ?? "", ano: ano ? Number(ano) : null, texto }),
});

const dados = await resposta.json().catch(() => ({}));
if (!resposta.ok) {
  console.error(`Falhou: ${dados.erro ?? resposta.status}`);
  process.exit(1);
}

const palavras = texto.split(/\s+/).filter(Boolean).length;
console.log(`"${titulo}" enviado como ${id} · ${palavras.toLocaleString("pt-BR")} palavras`);
console.log("Ele aparece na estante de quem entrar com a senha. Nada foi gravado no repositório.");
