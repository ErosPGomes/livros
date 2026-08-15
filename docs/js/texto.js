// Transforma o Markdown de um livro em palavras prontas para a leitura dinâmica.
//
// Porte direto do ReadingTextService do EasyTasks. Duas coisas acontecem aqui: a limpeza tira do
// Markdown tudo que não se lê em voz alta, e a marcação de ritmo calcula, para cada palavra, quanto
// tempo ela merece a mais que a palavra média. É esse fator que faz a leitura parecer natural em
// vez de metronômica — sem ele, a pontuação some e o texto vira uma metralhadora de palavras.

export const PPM_MINIMO = 100;
export const PPM_MAXIMO = 1200;

const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;

const CERCA_DE_CODIGO = /^\s*(```|~~~)/;
const TITULO = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const SUBLINHADO = /^\s{0,3}(=+|-{3,})\s*$/;
const IMAGEM = /!\[[^\]]*\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const TAG_HTML = /<[^>]{1,400}>/g;
const MARCA_DE_LISTA = /^\s{0,6}([*+\-]|\d{1,3}[.)])\s+/;
const MARCA_DE_CITACAO = /^\s{0,3}>+\s?/;
const SEPARADOR = /^\s{0,3}([*\-_]\s?){3,}$/;
const DIVISOR_DE_TABELA = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;
const ENFASE = /(\*{1,3}|_{1,3}|`+|~{2})/g;
const ESPACOS = /\s+/g;

// Palavras curtas e frequentes nas duas línguas que se lê por aqui. Servem só para não tratar
// "para" e "which" como vocabulário difícil ao calcular o ritmo.
const PALAVRAS_COMUNS = new Set([
  "a", "à", "ao", "aos", "as", "às", "com", "como", "da", "das", "de", "dela", "dele", "delas",
  "deles", "do", "dos", "e", "ela", "elas", "ele", "eles", "em", "entre", "essa", "esse", "esta",
  "este", "eu", "foi", "for", "isso", "isto", "já", "lhe", "mais", "mas", "me", "mesmo", "muito",
  "na", "nas", "nem", "no", "nos", "não", "num", "numa", "o", "os", "ou", "para", "pela", "pelas",
  "pelo", "pelos", "por", "porque", "quando", "que", "quem", "se", "sem", "ser", "seu", "seus",
  "só", "sua", "suas", "também", "te", "tem", "ter", "teu", "um", "uma", "uns", "umas", "você",
  "vocês", "and", "are", "at", "be", "but", "by", "for", "from", "had", "has", "have",
  "he", "her", "his", "how", "in", "is", "it", "its", "not", "of", "on", "or", "she", "that",
  "the", "their", "them", "there", "they", "this", "to", "was", "were", "what", "when", "which",
  "who", "why", "will", "with", "you", "your",
]);

/** Prepara um texto inteiro para o leitor. */
export function prepararTexto(titulo, conteudo) {
  const blocos = limparEmBlocos(conteudo ?? "");
  const capitulos = [];
  const palavras = [];

  let indiceCapitulo = -1;
  let tituloCapitulo = "";
  let inicioCapitulo = 0;

  let nivelCapitulo = 1;

  const fecharCapitulo = (fim) => {
    if (indiceCapitulo < 0) return;
    capitulos.push({
      indice: indiceCapitulo,
      titulo: tituloCapitulo || `Trecho ${indiceCapitulo + 1}`,
      nivel: nivelCapitulo,
      inicio: inicioCapitulo,
      palavras: Math.max(fim - inicioCapitulo, 0),
    });
  };

  for (const bloco of blocos) {
    if (bloco.titulo) {
      fecharCapitulo(palavras.length);
      indiceCapitulo++;
      tituloCapitulo = bloco.texto;
      nivelCapitulo = bloco.nivel ?? 1;
      inicioCapitulo = palavras.length;
    } else if (indiceCapitulo < 0) {
      // Texto que começa sem nenhum título ainda assim precisa de um trecho para navegar.
      indiceCapitulo = 0;
      tituloCapitulo = titulo || "Início";
      inicioCapitulo = 0;
    }

    adicionarParagrafo(palavras, bloco.texto, Math.max(indiceCapitulo, 0), bloco.titulo);
  }

  fecharCapitulo(palavras.length);

  // O ritmo de cada palavra é relativo, não absoluto. Guardando a média, a velocidade escolhida
  // passa a ser a velocidade que sai de fato: sem isso, "600 ppm" entregaria uns 500, porque toda
  // pontuação empurra o tempo para cima e nada empurra para baixo.
  const ritmoMedio = palavras.length
    ? palavras.reduce((soma, p) => soma + p.ritmo, 0) / palavras.length
    : 1;

  return {
    titulo: (titulo || capitulos[0]?.titulo || "Sem título").trim(),
    palavras,
    capitulos,
    total: palavras.length,
    ritmoMedio,
  };
}

function adicionarParagrafo(destino, paragrafo, indiceCapitulo, ehTitulo) {
  const partes = paragrafo.split(" ").filter(Boolean);
  for (let i = 0; i < partes.length; i++) {
    const texto = partes[i];
    const ultima = i === partes.length - 1;
    destino.push({
      texto,
      foco: pontoDeFoco(texto),
      ritmo: fatorDeRitmo(texto, i === 0, ultima, ehTitulo),
      indice: destino.length,
      fimDeParagrafo: ultima,
      // O modo texto já mostra o título como cabeçalho; sem esta marca ele apareceria duas vezes.
      titulo: Boolean(ehTitulo),
      capitulo: indiceCapitulo,
    });
  }
}

/**
 * Ponto de reconhecimento da palavra: a letra que fica alinhada ao centro do leitor. Ela não é o
 * meio exato — o olho reconhece a palavra um pouco à esquerda do centro.
 */
export function pontoDeFoco(palavra) {
  const n = palavra.length;
  if (n <= 1) return 0;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

/**
 * Quanto tempo a palavra merece em relação à palavra média. Os pesos são cumulativos e o resultado
 * é limitado para que nenhuma palavra sozinha quebre o ritmo da leitura.
 */
export function fatorDeRitmo(palavra, comecaParagrafo, terminaParagrafo, ehTitulo) {
  let fator = 1;
  const nucleo = [...palavra].filter((c) => LETRA_OU_NUMERO.test(c)).join("");

  // Palavra longa leva mais tempo para ser reconhecida, mesmo em leitores treinados.
  if (nucleo.length > 6) fator += Math.min((nucleo.length - 6) * 0.06, 0.6);

  // Número exige conferência dígito a dígito.
  if (/\d/.test(nucleo)) fator += 0.35;

  // Vocabulário incomum: nada de dicionário, apenas o tamanho fora das palavras de ligação.
  if (nucleo.length >= 10 && !PALAVRAS_COMUNS.has(nucleo.toLowerCase())) fator += 0.15;

  // A pontuação é a pausa natural do texto e é o que mais aproxima o RSVP da leitura real.
  const ultimo = palavra[palavra.length - 1];
  if (ultimo === "," || ultimo === ";" || ultimo === ":") fator += 0.45;
  else if (ultimo === "." || ultimo === "!" || ultimo === "?") fator += 0.85;
  else if (")]\"»”".includes(ultimo)) fator += 0.25;
  else if (ultimo === "—" || ultimo === "–") fator += 0.35;

  if (terminaFrase(palavra)) fator += 0.2;
  if (terminaParagrafo) fator += 0.7;
  if (comecaParagrafo) fator += 0.2;
  if (ehTitulo) fator += 0.5;

  return Math.min(Math.max(fator, 1), 3.5);
}

export function terminaFrase(palavra) {
  if (!palavra) return false;
  const limpa = palavra.replace(/[)\]"»”']+$/, "");
  if (!limpa) return false;
  if (!".!?…".includes(limpa[limpa.length - 1])) return false;

  // "Dr." e "p." terminam com ponto sem terminar a frase.
  const nucleo = limpa.replace(/[.!?…]+$/, "");
  return nucleo.length > 2 || /\d/.test(nucleo);
}

/**
 * Agrupa palavras em blocos de leitura. Acima de ~500 ppm o gargalo deixa de ser o olho e passa a
 * ser a troca de palavra: ler duas ou três de uma vez é o que permite continuar subindo. O bloco
 * fecha antes do previsto no fim de frase, senão a pausa cairia no meio da próxima ideia.
 */
export function agruparEmBlocos(palavras, tamanho) {
  if (tamanho <= 1) {
    return palavras.map((palavra) => ({
      texto: palavra.texto,
      foco: palavra.foco,
      ritmo: palavra.ritmo,
      inicio: palavra.indice,
      fim: palavra.indice,
      capitulo: palavra.capitulo,
    }));
  }

  const blocos = [];
  let atual = [];

  const fechar = () => {
    if (atual.length === 0) return;
    const texto = atual.map((p) => p.texto).join(" ");
    // Ler junto é mais rápido que ler separado, mas não na proporção do número de palavras.
    const ritmo = atual.reduce((soma, p) => soma + p.ritmo, 0) * 0.82;
    blocos.push({
      texto,
      foco: pontoDeFoco(texto),
      ritmo,
      inicio: atual[0].indice,
      fim: atual[atual.length - 1].indice,
      capitulo: atual[0].capitulo,
    });
    atual = [];
  };

  for (const palavra of palavras) {
    atual.push(palavra);
    if (atual.length >= tamanho || terminaFrase(palavra.texto) || palavra.fimDeParagrafo) {
      fechar();
    }
  }

  fechar();
  return blocos;
}

/**
 * Milissegundos que uma palavra (ou bloco) fica na tela. O ritmo médio do texto entra como divisor
 * para a velocidade escolhida ser a velocidade real, e não um teto que nunca se alcança.
 */
export function duracaoDe(item, ppm, ritmoMedio = 1) {
  const velocidade = Math.min(Math.max(ppm, PPM_MINIMO), PPM_MAXIMO);
  return (60000 / velocidade) * (item.ritmo / (ritmoMedio || 1));
}

/** Minutos restantes a partir de uma posição, já com o ritmo de cada palavra. */
export function minutosRestantes(documento, posicao, ppm) {
  let ms = 0;
  for (let i = Math.max(posicao, 0); i < documento.palavras.length; i++) {
    ms += duracaoDe(documento.palavras[i], ppm, documento.ritmoMedio);
  }
  return ms / 60000;
}

/**
 * Recua para o começo da frase anterior. Em RSVP, voltar uma palavra só não devolve o contexto
 * perdido — quem se distraiu precisa da frase inteira.
 */
export function inicioDaFraseAnterior(documento, posicao) {
  let i = Math.min(Math.max(posicao, 0), documento.palavras.length - 1);
  if (i <= 0) return 0;

  // O primeiro passo atrás evita ficar preso no fim da frase que acabou de ser lida.
  i--;
  while (i > 0 && !terminaFrase(documento.palavras[i - 1].texto)) i--;
  return i;
}

export function proximoCapitulo(documento, posicao) {
  const proximo = documento.capitulos.find((c) => c.inicio > posicao);
  return proximo ? proximo.inicio : Math.max(documento.total - 1, 0);
}

/**
 * Onde o livro realmente começa.
 *
 * Título, nome do autor, dedicatória e ficha catalográfica ficam antes do primeiro capítulo e não
 * são leitura — começar por eles é o que faz o leitor gastar as primeiras palavras com "Machado de
 * Assis" em vez da primeira frase. Nada é apagado: só o ponto de partida muda, e apenas quando a
 * mobília é pequena perto do livro, para nunca pular conteúdo de verdade.
 */
export function inicioDoMiolo(documento) {
  const primeiro = documento.capitulos.find((c) => c.nivel >= 2);
  if (!primeiro) return 0;

  const proporcao = primeiro.inicio / Math.max(documento.total, 1);
  return proporcao <= 0.03 ? primeiro.inicio : 0;
}

export function capituloEm(documento, posicao) {
  let encontrado = null;
  for (const capitulo of documento.capitulos) {
    if (capitulo.inicio <= posicao) encontrado = capitulo;
    else break;
  }
  return encontrado;
}

/** Texto corrido de uma janela de palavras, para o modo normal e o contexto da pausa. */
export function textoCorrido(documento, inicio, quantidade) {
  const comeco = Math.min(Math.max(inicio, 0), Math.max(documento.total - 1, 0));
  const partes = [];
  for (let i = comeco; i < documento.total && i < comeco + quantidade; i++) {
    const palavra = documento.palavras[i];
    partes.push(palavra.texto + (palavra.fimDeParagrafo ? "\n\n" : " "));
  }
  return partes.join("").trimEnd();
}

/** Índice da primeira palavra de cada parágrafo — é por onde o modo texto vira clicável. */
export function paragrafosDe(documento, inicioCapitulo, fimCapitulo) {
  const paragrafos = [];
  let atual = null;

  for (let i = inicioCapitulo; i < fimCapitulo && i < documento.total; i++) {
    if (documento.palavras[i].titulo) continue;
    if (!atual) atual = { inicio: i, palavras: [] };
    atual.palavras.push(documento.palavras[i].texto);
    if (documento.palavras[i].fimDeParagrafo) {
      paragrafos.push({ inicio: atual.inicio, texto: atual.palavras.join(" ") });
      atual = null;
    }
  }

  if (atual) paragrafos.push({ inicio: atual.inicio, texto: atual.palavras.join(" ") });
  return paragrafos;
}

// ---------------------------------------------------------------- limpeza do Markdown

function limparEmBlocos(conteudo) {
  const blocos = [];
  const linhas = conteudo.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let paragrafo = [];
  let dentroDeCodigo = false;

  const fechar = () => {
    const texto = normalizar(paragrafo.join(" "));
    paragrafo = [];
    if (texto) blocos.push({ texto, titulo: false });
  };

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];

    if (CERCA_DE_CODIGO.test(linha)) {
      fechar();
      dentroDeCodigo = !dentroDeCodigo;
      continue;
    }

    // Bloco de código não é prosa: ele quebraria o ritmo e não se lê palavra a palavra.
    if (dentroDeCodigo) continue;

    if (!linha.trim() || SEPARADOR.test(linha) || DIVISOR_DE_TABELA.test(linha)) {
      fechar();
      continue;
    }

    const titulo = TITULO.exec(linha);
    if (titulo) {
      fechar();
      const texto = normalizar(titulo[2]);
      if (texto) blocos.push({ texto, titulo: true, nivel: titulo[1].length });
      continue;
    }

    // Título sublinhado por "===" ou "---" na linha seguinte.
    if (i + 1 < linhas.length && SUBLINHADO.test(linhas[i + 1]) && paragrafo.length === 0) {
      const texto = normalizar(linha);
      if (texto) {
        blocos.push({ texto, titulo: true, nivel: linhas[i + 1].trim().startsWith("=") ? 1 : 2 });
        i++;
        continue;
      }
    }

    let limpa = linha.replace(MARCA_DE_CITACAO, "").replace(MARCA_DE_LISTA, "");
    limpa = limpa.split("|").join(" ");
    paragrafo.push(limpa);
  }

  fechar();
  return blocos;
}

function normalizar(valor) {
  let texto = valor.replace(IMAGEM, "").replace(LINK, "$1").replace(TAG_HTML, " ");
  texto = texto.replace(ENFASE, "");
  texto = texto
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
  texto = texto.replace(ESPACOS, " ").trim();

  // Uma linha que sobrou só com marcação não vira parágrafo.
  return LETRA_OU_NUMERO.test(texto) ? texto : "";
}

/** Deixa só letras e números da palavra, em minúsculas — base do teste de compreensão. */
export function nucleoDe(palavra) {
  return [...palavra].filter((c) => LETRA_OU_NUMERO.test(c)).join("").toLowerCase();
}

export function ehPalavraComum(nucleo) {
  return PALAVRAS_COMUNS.has(nucleo);
}
