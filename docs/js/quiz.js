// Teste de compreensão do trecho que acabou de ser lido.
//
// Não existe IA nem envio de texto para lugar nenhum: as perguntas saem do próprio trecho. O
// serviço escolhe frases de tamanho médio, esconde nelas a palavra que mais carrega o sentido e usa
// outras palavras marcantes do mesmo texto como alternativas erradas. É o formato de lacuna usado
// em teste de leitura — mede se o conteúdo ficou, não se a pessoa decorou a frase.

import { nucleoDe, ehPalavraComum, terminaFrase } from "./texto.js";

const ALTERNATIVAS = 4;
const MINIMO_DE_PALAVRAS = 8;
const MAXIMO_DE_PALAVRAS = 34;

export const PERGUNTAS_PADRAO = 4;
export const RETENCAO_SAUDAVEL = 70;

export function montarQuiz(documento, inicio, fim, quantidade = PERGUNTAS_PADRAO, semente = null) {
  const comeco = Math.min(Math.max(inicio, 0), Math.max(documento.total - 1, 0));
  const termino = Math.min(Math.max(fim, comeco), documento.total);
  const trecho = documento.palavras.slice(comeco, termino);
  if (trecho.length < MINIMO_DE_PALAVRAS * 2) return [];

  const vocabulario = contarPalavras(trecho);
  const frases = separarFrases(trecho).filter(
    (frase) => frase.length >= MINIMO_DE_PALAVRAS && frase.length <= MAXIMO_DE_PALAVRAS,
  );
  if (frases.length === 0) return [];

  const sortear = criarSorteio(semente);
  const candidatas = [...vocabulario.entries()]
    .filter(([nucleo]) => ehPalavraDeConteudo(nucleo))
    .sort((a, b) => b[1].total - a[1].total || b[0].length - a[0].length)
    .map(([nucleo, dados]) => ({ nucleo, exibicao: dados.exibicao }));
  if (candidatas.length < ALTERNATIVAS) return [];

  // Frases espalhadas pelo trecho cobrem mais conteúdo do que as melhores frases seguidas.
  const escolhidas = frases
    .map((frase, indice) => ({ frase, indice, nota: notaDaFrase(frase, vocabulario) }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, Math.max(quantidade * 3, quantidade))
    .sort((a, b) => a.indice - b.indice);

  const perguntas = [];
  const usadas = new Set();

  for (const candidata of espalhar(escolhidas, quantidade)) {
    const pergunta = montarPergunta(candidata.frase, vocabulario, candidatas, usadas, sortear);
    if (pergunta) {
      perguntas.push(pergunta);
      usadas.add(pergunta.nucleo);
    }
    if (perguntas.length === quantidade) break;
  }

  return perguntas;
}

function montarPergunta(frase, vocabulario, candidatas, usadas, sortear) {
  let alvo = -1;
  let melhorNota = 0;

  for (let i = 0; i < frase.length; i++) {
    const nucleo = nucleoDe(frase[i].texto);
    if (!ehPalavraDeConteudo(nucleo) || usadas.has(nucleo)) continue;

    // A palavra escondida precisa se repetir no trecho ou ser longa o bastante para carregar
    // sentido; senão a pergunta vira adivinhação.
    const frequencia = vocabulario.get(nucleo)?.total ?? 0;
    let nota = frequencia * 2 + nucleo.length;

    // A primeira palavra da frase entrega pouco contexto para a esquerda.
    if (i === 0) nota -= 4;

    if (nota > melhorNota) {
      melhorNota = nota;
      alvo = i;
    }
  }

  if (alvo < 0) return null;

  const nucleo = nucleoDe(frase[alvo].texto);
  const resposta = vocabulario.get(nucleo)?.exibicao ?? nucleo;
  const naFrase = new Set(frase.map((p) => nucleoDe(p.texto)));

  let erradas = candidatas
    .filter((c) => c.nucleo !== nucleo && !naFrase.has(c.nucleo))
    .filter((c) => Math.abs(c.nucleo.length - nucleo.length) <= 5);
  erradas = sortear(erradas).slice(0, ALTERNATIVAS - 1);

  if (erradas.length < ALTERNATIVAS - 1) {
    // Trecho com vocabulário pequeno: completa com qualquer outra palavra de conteúdo.
    const jaEscolhidas = new Set(erradas.map((c) => c.nucleo));
    const extras = sortear(
      candidatas.filter((c) => c.nucleo !== nucleo && !jaEscolhidas.has(c.nucleo)),
    ).slice(0, ALTERNATIVAS - 1 - erradas.length);
    erradas = erradas.concat(extras);
  }

  if (erradas.length < ALTERNATIVAS - 1) return null;

  const alternativas = sortear([...erradas.map((c) => c.exibicao), resposta]);
  return {
    nucleo,
    frase: comLacuna(frase, alvo),
    resposta,
    alternativas,
    correta: alternativas.findIndex((opcao) => opcao === resposta),
  };
}

function comLacuna(frase, posicao) {
  return frase
    .map((palavra, i) => {
      if (i !== posicao) return palavra.texto;
      // A pontuação da palavra escondida fica, para a frase continuar legível.
      const final = palavra.texto.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? "";
      return "________" + final;
    })
    .join(" ");
}

function separarFrases(trecho) {
  const frases = [];
  let atual = [];

  for (const palavra of trecho) {
    atual.push(palavra);
    if (terminaFrase(palavra.texto) || palavra.fimDeParagrafo) {
      frases.push(atual);
      atual = [];
    }
  }

  if (atual.length > 0) frases.push(atual);
  return frases;
}

/**
 * Conta cada palavra e guarda a grafia mais usada. Sem isso, um nome próprio viraria "brasil" na
 * alternativa, o que denuncia a resposta e fica feio na tela.
 */
function contarPalavras(trecho) {
  const mapa = new Map();

  for (const palavra of trecho) {
    const nucleo = nucleoDe(palavra.texto);
    if (!nucleo) continue;

    const exibicao = palavra.texto.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const registro = mapa.get(nucleo) ?? { total: 0, formas: new Map() };
    registro.total++;
    registro.formas.set(exibicao, (registro.formas.get(exibicao) ?? 0) + 1);
    mapa.set(nucleo, registro);
  }

  for (const registro of mapa.values()) {
    registro.exibicao = [...registro.formas.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return mapa;
}

function notaDaFrase(frase, vocabulario) {
  return frase.reduce((soma, palavra) => {
    const nucleo = nucleoDe(palavra.texto);
    if (!ehPalavraDeConteudo(nucleo)) return soma;
    return soma + (vocabulario.get(nucleo)?.total ?? 0) + Math.floor(nucleo.length / 3);
  }, 0);
}

function ehPalavraDeConteudo(nucleo) {
  return nucleo.length >= 5 && !ehPalavraComum(nucleo) && /\p{L}/u.test(nucleo);
}

function espalhar(itens, quantidade) {
  if (itens.length <= quantidade || quantidade <= 0) return itens;
  const passo = itens.length / quantidade;
  return Array.from({ length: quantidade }, (_, i) => itens[Math.floor(i * passo)]);
}

/** Embaralhador com semente opcional, para o teste dar sempre o mesmo resultado quando precisa. */
function criarSorteio(semente) {
  let estado = semente ?? Math.floor(Math.random() * 2 ** 31);
  const proximo = () => {
    estado = (estado * 1103515245 + 12345) % 2 ** 31;
    return estado / 2 ** 31;
  };

  return (lista) => {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(proximo() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  };
}

export function percentualDeAcerto(acertos, total) {
  if (total <= 0) return 0;
  return Math.round(Math.min(Math.max((acertos * 100) / total, 0), 100));
}

export function vereditoDe(percentual) {
  if (percentual >= 90) return "Compreensão alta. Dá para subir a velocidade na próxima sessão.";
  if (percentual >= RETENCAO_SAUDAVEL)
    return "Compreensão saudável. Mantenha esta velocidade por mais algumas sessões.";
  if (percentual >= 50)
    return "Compreensão média. Reduza um pouco a velocidade até este número passar de 70%.";
  return "Compreensão baixa. Volte para uma velocidade confortável: velocidade sem retenção não conta.";
}
