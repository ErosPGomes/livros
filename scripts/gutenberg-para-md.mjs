// Converte um livro em texto do Project Gutenberg para o Markdown que o leitor consome.
//
// Não é o caminho normal da biblioteca — livros de verdade vêm em .md convertidos no EasyTasks.
// Este script existe porque o texto do Gutenberg traz três problemas que todo PDF também traz, e
// resolvê-los aqui deixa o exemplo honesto: mobília antes e depois do miolo, linhas quebradas no
// meio do parágrafo e capítulos marcados só por um algarismo romano solto.
//
//   node scripts/gutenberg-para-md.mjs entrada.txt livros/saida.md "Título" "Autor"

import { readFileSync, writeFileSync } from "node:fs";

const [, , entrada, saida, titulo, autor] = process.argv;
if (!entrada || !saida) {
  console.error('uso: node scripts/gutenberg-para-md.mjs entrada.txt saida.md "Título" "Autor"');
  process.exit(1);
}

// O algarismo às vezes vem sozinho ("II") e às vezes com ponto ("II."). Aceitar só um dos dois
// gruda o capítulo seguinte no anterior sem erro nenhum aparecer.
const ROMANO = /^([IVXLCDM]+)\.?$/;
const FIM_DO_MIOLO = /^(FIM|INDICE|ÍNDICE|INDEX|FINIS)$/i;

const bruto = readFileSync(entrada, "utf8").replace(/\r\n/g, "\n");

// 1. Fora a mobília do Gutenberg: cabeçalho legal na frente, licença atrás.
const inicio = bruto.indexOf("*** START OF THE PROJECT GUTENBERG");
const fim = bruto.search(/\n\s*End of the Project Gutenberg|\*\*\* END OF THE PROJECT GUTENBERG/);
const miolo = bruto.slice(
  inicio >= 0 ? bruto.indexOf("\n", inicio) + 1 : 0,
  fim > 0 ? fim : bruto.length,
);

const linhas = miolo.split("\n");

// 2. Depois do miolo vêm "FIM" e o índice, que repetiria todos os capítulos como se fossem texto.
//    O corte é na marca, não por heurística: só vale a marca que aparece no último terço, para
//    um "FIM" solto no meio de um diálogo não truncar o livro.
const limiteSeguro = Math.floor(linhas.length * 0.7);
let ultimaLinha = linhas.length;
for (let i = limiteSeguro; i < linhas.length; i++) {
  if (FIM_DO_MIOLO.test(linhas[i].trim())) {
    ultimaLinha = i;
    break;
  }
}

const capitulos = [];
let atual = null;
let paragrafo = [];

const fecharParagrafo = () => {
  if (paragrafo.length > 0 && atual) {
    atual.blocos.push(paragrafo.join(" ").replace(/\s+/g, " ").trim());
  }
  paragrafo = [];
};

for (let i = 0; i < ultimaLinha; i++) {
  const linha = linhas[i].trim();

  // 3. Capítulo: um algarismo romano sozinho, com o título na próxima linha com conteúdo.
  const marca = ROMANO.exec(linha);
  if (marca) {
    let j = i + 1;
    while (j < ultimaLinha && linhas[j].trim() === "") j++;
    const possivelTitulo = (linhas[j] ?? "").trim();

    // Um romano seguido de parágrafo longo é numeral no meio do texto, não cabeçalho.
    if (possivelTitulo && possivelTitulo.length < 60) {
      fecharParagrafo();
      atual = { numero: marca[1], titulo: possivelTitulo.replace(/\.$/, ""), blocos: [] };
      capitulos.push(atual);
      i = j;
      continue;
    }
  }

  if (linha === "") {
    fecharParagrafo();
    continue;
  }

  // 4. Linha quebrada pela largura da página vira continuação do mesmo parágrafo.
  if (atual) paragrafo.push(linha);
}

fecharParagrafo();

if (capitulos.length === 0) {
  console.error("Nenhum capítulo encontrado — confira o formato do arquivo.");
  process.exit(1);
}

const partes = [`# ${titulo ?? "Sem título"}`];
if (autor) partes.push(`_${autor}_`);

for (const capitulo of capitulos) {
  partes.push(`## ${capitulo.numero}. ${capitulo.titulo}`);
  partes.push(...capitulo.blocos);
}

const markdown = partes.join("\n\n") + "\n";
writeFileSync(saida, markdown, "utf8");

const palavras = markdown.split(/\s+/).filter(Boolean).length;
console.log(`${capitulos.length} capítulos · ${palavras.toLocaleString("pt-BR")} palavras → ${saida}`);
