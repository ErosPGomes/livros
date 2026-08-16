// Onde o app guarda o que é seu: o perfil de leitura e o texto dos livros.
//
// Por enquanto o perfil mora no localStorage e os livros vêm de arquivos estáticos. Quando a Edge
// Function entrar, só as duas funções de acesso mudam — o resto do app não sabe de onde os dados
// vêm, e é de propósito.

import * as nuvem from "./nuvem.js";

const CHAVE = "leitura.perfil.v1";
const PASTA_DE_LIVROS = "./livros/";

export const AJUSTES_PADRAO = {
  tema: "escuro",
  fonte: "serifada",
  tamanho: 3,
  blocos: 1,
  pushMode: false,
  autoCapitulo: true,
  som: "nenhum",
  volume: 0.25,
  regressaoAoRetomar: true,
  telaCheia: true,
  imersivo: true,
};

export function perfilVazio() {
  return {
    versao: 1,
    atualizadoEm: null,
    biblioteca: [],
    sessoes: [],
    metas: { minutosPorDia: 15, ppm: 600, livrosPorAno: 52 },
    ppmInicial: 0,
    ppmMedidoEm: null,
    passosFeitos: 0,
    ultimoPpm: 300,
    ajustes: { ...AJUSTES_PADRAO },
  };
}

export function carregarPerfil() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return perfilVazio();

    const perfil = JSON.parse(bruto);
    const base = perfilVazio();
    // Um perfil gravado por uma versão antiga não pode derrubar o app: o que faltar vira padrão.
    return {
      ...base,
      ...perfil,
      metas: { ...base.metas, ...(perfil.metas ?? {}) },
      ajustes: { ...base.ajustes, ...(perfil.ajustes ?? {}) },
      biblioteca: perfil.biblioteca ?? [],
      sessoes: perfil.sessoes ?? [],
    };
  } catch {
    return perfilVazio();
  }
}

export function salvarPerfil(perfil) {
  try {
    // O carimbo é o que permite decidir, na sincronização, qual lado mexeu por último.
    perfil.atualizadoEm = new Date().toISOString();
    localStorage.setItem(CHAVE, JSON.stringify(perfil));
    return true;
  } catch {
    // Cota estourada ou modo privado: o app continua funcionando, só não lembra depois.
    return false;
  }
}

/**
 * Catálogo da estante: os livros públicos publicados junto com o app mais, quando há sessão, os
 * livros guardados na nuvem. Os dois convivem — o que é domínio público continua funcionando
 * offline e sem senha.
 */
export async function carregarCatalogo() {
  const publicos = await fetch(`${PASTA_DE_LIVROS}index.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : { livros: [] }))
    .then((d) => (d.livros ?? []).filter((l) => l.arquivo))
    .catch(() => []);

  if (!nuvem.conectada()) return publicos;

  try {
    const { livros } = await nuvem.catalogoRemoto();
    const remotos = (livros ?? []).map((l) => ({ ...l, remoto: true }));
    // Um livro que exista dos dois lados aparece uma vez só; o do repositório ganha, por ser offline.
    const ids = new Set(publicos.map((l) => l.id));
    return [...publicos, ...remotos.filter((l) => !ids.has(l.id))];
  } catch {
    return publicos;
  }
}

/** Texto de um livro: arquivo publicado ou, se for da nuvem, atrás da senha. */
export async function carregarTextoDoLivro(livro) {
  if (livro.remoto) {
    const dados = await nuvem.livroRemoto(livro.id);
    return dados.texto;
  }

  const resposta = await fetch(`${PASTA_DE_LIVROS}${livro.arquivo}`);
  if (!resposta.ok) throw new Error(`O texto de "${livro.titulo}" não foi encontrado.`);
  return resposta.text();
}

/**
 * Junta o catálogo com o progresso guardado. O catálogo manda no que existe; o perfil manda em
 * onde a leitura parou.
 */
export function combinarComProgresso(catalogo, perfil) {
  return catalogo.map((livro) => {
    const guardado = perfil.biblioteca.find((item) => item.id === livro.id);
    return {
      ...livro,
      posicao: guardado?.posicao ?? 0,
      totalPalavras: guardado?.totalPalavras ?? 0,
      abertoEm: guardado?.abertoEm ?? null,
      terminadoEm: guardado?.terminadoEm ?? null,
    };
  });
}

/**
 * Junta o perfil deste aparelho com o que está na nuvem.
 *
 * Não é "o mais recente vence": isso apagaria as sessões lidas no outro aparelho enquanto este
 * estava offline. Histórico e biblioteca são somados, e só o que é escolha única — metas, ajustes,
 * plano — segue quem foi mexido por último.
 */
export function mesclarPerfis(local, remoto, remotoEhMaisNovo) {
  if (!remoto) return local;

  const preferido = remotoEhMaisNovo ? remoto : local;
  const outro = remotoEhMaisNovo ? local : remoto;

  const sessoes = new Map();
  for (const sessao of [...(local.sessoes ?? []), ...(remoto.sessoes ?? [])]) {
    sessoes.set(`${sessao.terminadaEm}|${sessao.livroId}`, sessao);
  }

  const biblioteca = new Map();
  for (const item of [...(local.biblioteca ?? []), ...(remoto.biblioteca ?? [])]) {
    const anterior = biblioteca.get(item.id);
    if (!anterior) { biblioteca.set(item.id, { ...item }); continue; }

    // Quem leu mais longe manda na posição; terminar um livro nunca é desfeito.
    biblioteca.set(item.id, {
      ...anterior,
      ...item,
      posicao: Math.max(anterior.posicao ?? 0, item.posicao ?? 0),
      totalPalavras: Math.max(anterior.totalPalavras ?? 0, item.totalPalavras ?? 0),
      abertoEm: maisRecente(anterior.abertoEm, item.abertoEm),
      terminadoEm: anterior.terminadoEm ?? item.terminadoEm ?? null,
    });
  }

  return {
    ...preferido,
    metas: { ...outro.metas, ...preferido.metas },
    ajustes: { ...outro.ajustes, ...preferido.ajustes },
    sessoes: [...sessoes.values()].sort((a, b) => new Date(a.terminadaEm) - new Date(b.terminadaEm)),
    biblioteca: [...biblioteca.values()],
    passosFeitos: Math.max(local.passosFeitos ?? 0, remoto.passosFeitos ?? 0),
    ppmInicial: preferido.ppmInicial || outro.ppmInicial || 0,
  };
}

function maisRecente(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

export function registroDoLivro(perfil, livro) {
  let registro = perfil.biblioteca.find((item) => item.id === livro.id);
  if (!registro) {
    registro = {
      id: livro.id,
      titulo: livro.titulo,
      autor: livro.autor ?? "",
      posicao: 0,
      totalPalavras: 0,
      abertoEm: null,
      terminadoEm: null,
    };
    perfil.biblioteca.push(registro);
  }
  return registro;
}
