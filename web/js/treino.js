// A parte de treino: mede a velocidade, monta o plano progressivo, soma o histórico e cuida da
// ofensiva e das conquistas.
//
// Tudo é aritmética sobre as sessões já lidas — nenhum serviço externo participa. O plano segue a
// ideia de treino físico: dias de empurrão acima do ritmo confortável, dias de consolidação um
// pouco abaixo e conferência de compreensão no meio e no fim, para que a velocidade só suba quando
// o entendimento acompanha.

import { PPM_MINIMO, PPM_MAXIMO } from "./texto.js";
import { RETENCAO_SAUDAVEL } from "./quiz.js";

export const DIAS_DO_PLANO = 14;
export const PPM_INICIAL_PADRAO = 250;

const PALAVRAS_POR_LIVRO = 70000;

// ---------------------------------------------------------------- estatísticas

export function calcularEstatisticas(perfil) {
  const sessoes = perfil.sessoes ?? [];
  const livrosTerminados = (perfil.biblioteca ?? []).filter((item) => item.terminadoEm).length;

  if (sessoes.length === 0) {
    return {
      sessoes: 0, palavras: 0, minutos: 0, ppmMedio: 0, ppmRecorde: 0,
      retencaoMedia: null, ofensiva: 0, ofensivaRecorde: 0, minutosHoje: 0,
      diasLidos: 0, livrosTerminados,
    };
  }

  const palavras = sessoes.reduce((soma, s) => soma + s.palavras, 0);
  const segundos = sessoes.reduce((soma, s) => soma + s.segundos, 0);
  const retencoes = sessoes.map((s) => s.retencao).filter((r) => typeof r === "number");
  const hoje = chaveDoDia(new Date());
  const minutosHoje =
    sessoes.filter((s) => chaveDoDia(new Date(s.terminadaEm)) === hoje)
      .reduce((soma, s) => soma + s.segundos, 0) / 60;

  const dias = diasComLeitura(sessoes);
  const { atual, recorde } = calcularOfensivas(dias);

  return {
    sessoes: sessoes.length,
    palavras,
    minutos: segundos / 60,
    ppmMedio: segundos <= 0 ? 0 : Math.round(palavras / (segundos / 60)),
    ppmRecorde: Math.max(...sessoes.map(ppmEfetivo)),
    retencaoMedia: retencoes.length === 0 ? null : Math.round(media(retencoes)),
    ofensiva: atual,
    ofensivaRecorde: recorde,
    minutosHoje,
    diasLidos: dias.length,
    livrosTerminados,
  };
}

export function ppmEfetivo(sessao) {
  return sessao.segundos <= 0 ? 0 : Math.round(sessao.palavras / (sessao.segundos / 60));
}

/**
 * Ofensiva com um perdão por semana.
 *
 * Um dia perdido não derruba a sequência, desde que não tenha havido outro nos seis dias
 * anteriores. Sem isso, quem lê trinta dias seguidos e falta um abandona de vez — e o objetivo da
 * ofensiva é trazer de volta, não punir. A regra vale igual para a sequência atual e para o
 * recorde, senão o número de hoje poderia passar o recorde e ficar sem sentido.
 */
function calcularOfensivas(dias) {
  if (dias.length === 0) return { atual: 0, recorde: 0 };

  const sequencias = [];
  let inicio = dias[0];
  let anterior = dias[0];
  let ultimoPerdao = null;

  for (let i = 1; i < dias.length; i++) {
    const distancia = diferencaEmDias(anterior, dias[i]);

    if (distancia === 1) {
      anterior = dias[i];
      continue;
    }

    const podePerdoar =
      distancia === 2 && (ultimoPerdao === null || diferencaEmDias(ultimoPerdao, dias[i]) >= 7);

    if (podePerdoar) {
      ultimoPerdao = dias[i];
      anterior = dias[i];
      continue;
    }

    sequencias.push({ inicio, fim: anterior });
    inicio = dias[i];
    anterior = dias[i];
    ultimoPerdao = null;
  }

  sequencias.push({ inicio, fim: anterior });

  const tamanho = (s) => diferencaEmDias(s.inicio, s.fim) + 1;
  const recorde = Math.max(...sequencias.map(tamanho));

  // A ofensiva continua viva se o último dia lido foi hoje ou ontem.
  const ultima = sequencias[sequencias.length - 1];
  const distanciaDeHoje = diferencaEmDias(ultima.fim, hojeSemHora());
  const atual = distanciaDeHoje <= 1 ? tamanho(ultima) : 0;

  return { atual, recorde: Math.max(recorde, atual) };
}

/** Livros por ano no ritmo atual — o número que o ReadCoach chama de "livros/ano". */
export function livrosPorAno(estatisticas, palavrasPorLivro = PALAVRAS_POR_LIVRO) {
  if (estatisticas.ppmMedio <= 0 || estatisticas.diasLidos === 0) return 0;
  const minutosPorDia = estatisticas.minutos / estatisticas.diasLidos;
  return Math.round((estatisticas.ppmMedio * minutosPorDia * 365) / palavrasPorLivro);
}

// ---------------------------------------------------------------- plano

export function montarPlano(perfil) {
  const inicial = perfil.ppmInicial > 0 ? perfil.ppmInicial : PPM_INICIAL_PADRAO;
  const meta = Math.max(perfil.metas.ppm, inicial + 50);
  const minutos = Math.max(perfil.metas.minutosPorDia, 5);
  const passos = [];

  for (let dia = 1; dia <= DIAS_DO_PLANO; dia++) {
    const rampa = (dia - 1) / (DIAS_DO_PLANO - 1);
    let ppm = inicial + (meta - inicial) * rampa;
    let foco = "Ritmo constante";

    if (dia % 4 === 0) {
      // Dia de consolidação: recua um pouco para firmar o que foi ganho.
      ppm *= 0.9;
      foco = "Consolidação, um pouco abaixo do ritmo";
    } else if (dia % 4 === 3) {
      ppm *= 1.08;
      foco = "Empurrão acima do confortável";
    }

    if (dia === 7 || dia === DIAS_DO_PLANO) foco = "Teste de compreensão ao fim da sessão";

    passos.push({
      dia,
      ppm: arredondarPara10(Math.round(ppm)),
      minutos,
      foco,
      feito: dia <= perfil.passosFeitos,
    });
  }

  const feitos = passos.filter((p) => p.feito).length;
  return {
    inicial,
    meta,
    passos,
    feitos,
    proximo: passos.find((p) => !p.feito) ?? null,
    percentual: (feitos * 100) / DIAS_DO_PLANO,
  };
}

export function registrarSessao(perfil, sessao) {
  if (sessao.palavras <= 0 || sessao.segundos <= 0) return;

  perfil.sessoes.push(sessao);
  perfil.ultimoPpm = sessao.ppmAlvo;

  if (!perfil.ppmInicial || perfil.ppmInicial <= 0) {
    // Sem teste inicial, a primeira sessão real serve de linha de base.
    perfil.ppmInicial = ppmEfetivo(sessao);
    perfil.ppmMedidoEm = sessao.terminadaEm;
  }

  // O plano só avança quando a sessão cumpre o tempo do dia; senão a escada sobe sozinha.
  const plano = montarPlano(perfil);
  if (plano.proximo && sessao.segundos >= plano.proximo.minutos * 60 * 0.8) {
    perfil.passosFeitos = Math.min(perfil.passosFeitos + 1, DIAS_DO_PLANO);
  }
}

/**
 * Velocidade sugerida para a próxima sessão. Sobe quando a compreensão está saudável e recua
 * quando o leitor está entendendo pouco — é o freio contra a velocidade vazia.
 */
export function ppmSugerido(perfil) {
  const plano = montarPlano(perfil);
  let sugestao = plano.proximo?.ppm ?? plano.passos[plano.passos.length - 1].ppm;

  const recentes = (perfil.sessoes ?? [])
    .filter((s) => typeof s.retencao === "number")
    .slice(-3)
    .map((s) => s.retencao);

  if (recentes.length > 0) {
    const m = media(recentes);
    if (m < 50) sugestao *= 0.8;
    else if (m < RETENCAO_SAUDAVEL) sugestao *= 0.9;
    else if (m >= 90) sugestao *= 1.05;
  }

  return Math.min(Math.max(arredondarPara10(Math.round(sugestao)), PPM_MINIMO), PPM_MAXIMO);
}

export function fraseDeIncentivo(perfil, e) {
  if (e.sessoes === 0) return "Faça o teste de velocidade para montar seu plano de duas semanas.";

  const meta = perfil.metas.minutosPorDia;
  if (e.minutosHoje >= meta) {
    return `Meta de hoje cumprida: ${Math.round(e.minutosHoje)} de ${meta} minutos.`;
  }

  const faltam = Math.ceil(meta - e.minutosHoje);
  if (e.ofensiva > 1) return `Ofensiva de ${e.ofensiva} dias. Faltam ${faltam} min para manter hoje.`;
  if (e.retencaoMedia !== null && e.retencaoMedia < RETENCAO_SAUDAVEL) {
    return `Retenção média em ${e.retencaoMedia}%. Vale reduzir a velocidade até passar de ${RETENCAO_SAUDAVEL}%.`;
  }
  return `Faltam ${faltam} minutos para a meta de hoje.`;
}

// ---------------------------------------------------------------- conquistas

const CONQUISTAS = [
  { id: "primeira", icone: "◔", titulo: "Primeira sessão", detalhe: "Você começou", meta: (e) => e.sessoes >= 1 },
  { id: "ofensiva7", icone: "▲", titulo: "Uma semana", detalhe: "7 dias de ofensiva", meta: (e) => e.ofensivaRecorde >= 7 },
  { id: "ofensiva30", icone: "◆", titulo: "Um mês", detalhe: "30 dias de ofensiva", meta: (e) => e.ofensivaRecorde >= 30 },
  { id: "ppm400", icone: "»", titulo: "400 ppm", detalhe: "Acima da média", meta: (e) => e.ppmRecorde >= 400 },
  { id: "ppm600", icone: "»»", titulo: "600 ppm", detalhe: "O dobro do comum", meta: (e) => e.ppmRecorde >= 600 },
  { id: "ppm800", icone: "»»»", titulo: "800 ppm", detalhe: "Território raro", meta: (e) => e.ppmRecorde >= 800 },
  { id: "retencao", icone: "◉", titulo: "Retenção firme", detalhe: "80% em 5 testes", meta: (e, p) => contarTestes(p) >= 5 && (e.retencaoMedia ?? 0) >= 80 },
  { id: "palavras", icone: "▬", titulo: "100 mil palavras", detalhe: "Cerca de um livro e meio", meta: (e) => e.palavras >= 100000 },
  { id: "livro", icone: "▮", titulo: "Primeiro livro", detalhe: "Do começo ao fim", meta: (e) => e.livrosTerminados >= 1 },
];

export function conquistas(perfil, estatisticas) {
  return CONQUISTAS.map((c) => ({
    id: c.id,
    icone: c.icone,
    titulo: c.titulo,
    detalhe: c.detalhe,
    conquistada: Boolean(c.meta(estatisticas, perfil)),
  }));
}

function contarTestes(perfil) {
  return (perfil.sessoes ?? []).filter((s) => typeof s.retencao === "number").length;
}

// ---------------------------------------------------------------- utilidades de data

function hojeSemHora() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function chaveDoDia(data) {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

function diasComLeitura(sessoes) {
  const mapa = new Map();
  for (const sessao of sessoes) {
    const data = new Date(sessao.terminadaEm);
    const dia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    mapa.set(chaveDoDia(dia), dia);
  }
  return [...mapa.values()].sort((a, b) => a - b);
}

function diferencaEmDias(de, para) {
  return Math.round((para - de) / 86400000);
}

function media(valores) {
  return valores.reduce((soma, v) => soma + v, 0) / valores.length;
}

function arredondarPara10(ppm) {
  return Math.round(ppm / 10) * 10;
}
