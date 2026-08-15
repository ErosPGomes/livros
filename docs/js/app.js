// Amarra tudo: telas, estante, leitor, teste de compreensão e painel de treino.
// Este é o único arquivo que toca no DOM — o resto do app é lógica pura.

import {
  prepararTexto, textoCorrido, capituloEm, paragrafosDe, minutosRestantes, inicioDoMiolo, PPM_MAXIMO,
} from "./texto.js";
import { montarQuiz, percentualDeAcerto, vereditoDe } from "./quiz.js";
import {
  calcularEstatisticas, montarPlano, registrarSessao, ppmSugerido, fraseDeIncentivo,
  livrosPorAno, conquistas, ppmEfetivo, DIAS_DO_PLANO,
} from "./treino.js";
import {
  carregarPerfil, salvarPerfil, carregarCatalogo, carregarTextoDoLivro,
  combinarComProgresso, registroDoLivro, mesclarPerfis,
} from "./dados.js";
import * as nuvem from "./nuvem.js";
import { Leitor } from "./leitor.js";
import { Ambiente, faixasDisponiveis } from "./som.js";

const TEXTO_DO_TESTE = `
As pessoas costumam achar que ler depressa é passar os olhos por cima das palavras. Quem lê bem faz
o contrário do que parece: gasta menos tempo em cada palavra e mais atenção no sentido que elas
formam juntas. A diferença entre um leitor lento e um leitor rápido raramente está nos olhos. Está
no hábito que cada um construiu sem perceber.

O primeiro hábito que atrapalha é a voz interna. Quase todo mundo aprendeu a ler falando baixinho e
depois apenas repetindo as palavras dentro da cabeça. Essa voz é confortável, mas ela prende a
leitura na velocidade da fala. Ninguém fala mais de cento e cinquenta palavras por minuto, e é
exatamente aí que a maioria dos leitores fica parada a vida inteira, mesmo lendo todos os dias.

O segundo hábito é o retorno. Os olhos voltam para a linha anterior porque a atenção escapou por um
instante. Na maior parte das vezes o trecho tinha sido entendido, e a volta serve apenas para
acalmar a insegurança. Cada retorno custa pouco tempo sozinho, mas eles se somam e chegam a consumir
um terço de tudo que se gasta lendo uma página.

O terceiro hábito é o salto irregular. Os olhos não deslizam pela linha, eles pulam em pequenos
saltos e param em pontos fixos. Quanto mais curtos e desorganizados são esses saltos, mais paradas a
leitura exige. Um leitor treinado enxerga um grupo maior de palavras em cada parada e precisa de
menos paradas por linha.

Existe um limite, e vale conhecê-lo antes de perseguir números. Acima de certa velocidade, a
compreensão começa a cair, e ler sem entender não é leitura, é apenas movimento. O treino útil é
aquele que empurra a velocidade até a beira desse limite, confere o quanto ficou e recua quando o
entendimento não acompanha. Velocidade sem retenção não conta.

Por isso qualquer treino sério de leitura alterna duas coisas. Sessões curtas e frequentes, porque a
atenção sustentada é o que mais cansa, e uma conferência honesta do que foi compreendido ao fim de
cada etapa. O ganho aparece em semanas, não em um dia, e ele vem principalmente de abandonar hábitos
antigos, não de aprender truques novos.
`;

const $ = (id) => document.getElementById(id);
const app = $("app");

let perfil = carregarPerfil();
let catalogo = [];
let livroAtual = null;
let documento = null;
let modoTeste = false;

let quiz = [];
let quizIndice = 0;
let quizAcertos = 0;
let quizRespondida = false;
let quizEscolha = -1;
let sessaoPendente = null;

const ambiente = new Ambiente();

const leitor = new Leitor({
  onBloco: desenharBloco,
  onEstado: (tocando) => {
    $("palco").dataset.tocando = String(tocando);
    $("botaoTocar").textContent = tocando ? "Pausar" : "Iniciar";
    if (tocando) ambiente.tocar();
    atualizarMedidores();
  },
  onVelocidade: (ppm) => { $("medidorPpm").textContent = `${ppm} ppm`; },
  onFim: aoTerminarOTexto,
  onCapitulo: () => avisar("Fim do trecho. Toque em iniciar para seguir."),
  onContagem: (n) => {
    const alvo = $("contagem");
    if (n <= 0) { alvo.hidden = true; return; }
    alvo.hidden = false;
    alvo.textContent = String(n);
    // Reinicia a animação a cada número.
    alvo.style.animation = "none";
    void alvo.offsetWidth;
    alvo.style.animation = "";
  },
});

// ================================================================ telas

function irPara(tela) {
  if (app.dataset.tela === "leitor" && tela !== "leitor") {
    leitor.pausar();
    guardarPosicao();
  }

  app.dataset.tela = tela;
  for (const botao of $("abas").children) {
    botao.dataset.ativo = String(botao.dataset.ir === tela);
  }
  if (tela === "progresso") desenharProgresso();
  if (tela === "estante") desenharEstante();
  window.scrollTo(0, 0);
}

function avisar(mensagem, duracao = 3600) {
  const caixa = $("aviso");
  caixa.textContent = mensagem;
  caixa.hidden = false;
  clearTimeout(avisar.timer);
  avisar.timer = setTimeout(() => { caixa.hidden = true; }, duracao);
}

function abrirFolha(id) { $(id).hidden = false; }
function fecharFolha(id) { $(id).hidden = true; }

function plural(quantidade, singular, plural_) {
  return `${quantidade} ${quantidade === 1 ? singular : plural_}`;
}

// ================================================================ estante

async function iniciarEstante() {
  try {
    catalogo = await carregarCatalogo();
  } catch {
    catalogo = [];
    avisar("Não consegui ler o catálogo de livros.");
  }
  desenharEstante();
}

function desenharEstante() {
  const livros = combinarComProgresso(catalogo, perfil);
  const caixa = $("estante");
  caixa.innerHTML = "";
  $("estanteVazia").hidden = livros.length > 0;

  for (const livro of livros) {
    const botao = document.createElement("button");
    botao.className = "livro";
    botao.type = "button";
    botao.innerHTML = `
      <span class="livro__lombada"></span>
      <span class="livro__dados">
        <span class="livro__titulo"></span>
        <span class="livro__autor"></span>
        <span class="livro__estado"></span>
      </span>
      <span class="icone">›</span>`;
    botao.querySelector(".livro__titulo").textContent = livro.titulo;
    botao.querySelector(".livro__autor").textContent = livro.autor ?? "";
    botao.querySelector(".livro__estado").textContent = estadoDoLivro(livro);
    botao.addEventListener("click", () => abrirLivro(livro));
    caixa.append(botao);
  }

  // Sem sessão, a estante mostra só o que é público — o convite é o que explica a diferença.
  const faltaEntrar = nuvem.configurada() && !nuvem.conectada();
  $("convite").hidden = !faltaEntrar;
  if (faltaEntrar) {
    $("conviteTexto").textContent = livros.length > 0
      ? "A estante completa fica guardada fora do aparelho. Entre para vê-la e sincronizar o progresso entre o celular e o computador."
      : "Entre para ver a sua estante e sincronizar o progresso entre o celular e o computador.";
  }

  const emLeitura = livros
    .filter((l) => l.abertoEm && !l.terminadoEm && l.posicao > 0)
    .sort((a, b) => new Date(b.abertoEm) - new Date(a.abertoEm))[0];

  $("retomar").hidden = !emLeitura;
  if (emLeitura) {
    const percentual = emLeitura.totalPalavras
      ? Math.round((emLeitura.posicao * 100) / emLeitura.totalPalavras) : 0;
    $("retomarTitulo").textContent = emLeitura.titulo;
    $("retomarDetalhe").textContent = `${percentual}% lido`;
    $("retomarBarra").style.width = `${percentual}%`;
    $("botaoRetomar").onclick = () => abrirLivro(emLeitura);
  }
}

function estadoDoLivro(livro) {
  if (livro.terminadoEm) return "Concluído";
  if (!livro.posicao || !livro.totalPalavras) return "Não iniciado";
  return `${Math.round((livro.posicao * 100) / livro.totalPalavras)}% lido`;
}

async function abrirLivro(livro) {
  try {
    avisar("Preparando o texto…", 1500);
    const conteudo = await carregarTextoDoLivro(livro);
    documento = prepararTexto(livro.titulo, conteudo);
    livroAtual = livro;
    modoTeste = false;

    const registro = registroDoLivro(perfil, livro);
    registro.totalPalavras = documento.total;
    registro.abertoEm = new Date().toISOString();
    salvarPerfil(perfil);

    leitor.definirPpm(ppmSugerido(perfil));
    $("faixaPpm").value = String(leitor.ppmBase);
    $("valorPpm").textContent = `${leitor.ppmBase} ppm`;
    const posicaoInicial = registro.posicao > 0
      ? Math.min(registro.posicao, documento.total - 1)
      : inicioDoMiolo(documento);
    leitor.carregar(documento, posicaoInicial);

    $("palavra").hidden = false;
    $("palcoVazio").hidden = true;
    $("leitorTitulo").textContent = documento.titulo;
    atualizarMedidores();
    irPara("leitor");
  } catch (erro) {
    avisar(erro.message ?? "Não foi possível abrir o livro.");
  }
}

// ================================================================ leitor

function desenharBloco(bloco) {
  const texto = bloco.texto;
  const foco = Math.min(Math.max(bloco.foco, 0), Math.max(texto.length - 1, 0));
  $("palavraEsq").textContent = texto.slice(0, foco);
  $("palavraFoco").textContent = texto[foco] ?? "";
  $("palavraDir").textContent = texto.slice(foco + 1);
  atualizarMedidores();
}

function atualizarMedidores() {
  if (!documento) return;

  const posicao = leitor.posicao;
  const percentual = documento.total ? Math.min((posicao * 100) / documento.total, 100) : 0;
  $("progressoFino").style.width = `${percentual}%`;
  $("medidorPosicao").textContent = `${posicao.toLocaleString("pt-BR")} / ${documento.total.toLocaleString("pt-BR")}`;
  $("medidorPpm").textContent = `${leitor.ppm} ppm`;

  const minutos = minutosRestantes(documento, posicao, leitor.ppm);
  $("medidorTempo").textContent = minutos < 1 ? "menos de 1 min" : `${Math.round(minutos)} min restantes`;

  const capitulo = capituloEm(documento, posicao);
  $("leitorCapitulo").textContent = capitulo ? capitulo.titulo : "";

  // O contexto só aparece na pausa: durante a leitura ele competiria com a palavra.
  $("contexto").textContent = leitor.tocando
    ? ""
    : textoCorrido(documento, Math.max(posicao - 22, 0), 30).replace(/\n\n/g, " ");
}

function guardarPosicao() {
  if (!livroAtual || modoTeste || !documento) return;
  const registro = registroDoLivro(perfil, livroAtual);
  registro.posicao = leitor.posicao;
  registro.totalPalavras = documento.total;
  perfil.ultimoPpm = leitor.ppmBase;
  salvarPerfil(perfil);
}

function aoTerminarOTexto() {
  if (modoTeste) { encerrarTeste(); return; }
  if (livroAtual) {
    const registro = registroDoLivro(perfil, livroAtual);
    registro.terminadoEm ??= new Date().toISOString();
    salvarPerfil(perfil);
  }
  avisar("Fim do texto. Use “Encerrar e testar” para registrar a sessão.", 5000);
}

// ================================================================ sessão e quiz

function encerrarSessao() {
  if (!documento) { avisar("Abra um livro antes de encerrar."); return; }

  leitor.pausar();

  if (modoTeste) { encerrarTeste(); return; }

  const palavras = leitor.palavrasLidas;
  const segundos = leitor.segundosLidos;

  if (palavras < 20 || segundos < 5) {
    guardarPosicao();
    avisar("A sessão foi curta demais para virar medição. Leia alguns parágrafos.");
    return;
  }

  sessaoPendente = {
    terminadaEm: new Date().toISOString(),
    livroId: livroAtual?.id ?? "",
    titulo: documento.titulo,
    palavras,
    segundos,
    ppmAlvo: leitor.ppmBase,
    retencao: null,
  };

  quiz = montarQuiz(documento, leitor.inicioDaSessao, leitor.posicao);
  if (quiz.length === 0) {
    const sessao = sessaoPendente;
    concluirSessao(sessao);
    mostrarResultado("Sessão registrada", sessao, null);
    return;
  }

  quizIndice = 0;
  quizAcertos = 0;
  mostrarPergunta();
}

function mostrarPergunta() {
  quizRespondida = false;
  quizEscolha = -1;

  const pergunta = quiz[quizIndice];
  $("quizContador").textContent = `Pergunta ${quizIndice + 1} de ${quiz.length}`;
  $("quizFrase").textContent = pergunta.frase;
  $("quizRetorno").textContent = "Qual palavra completa a frase que você acabou de ler?";
  $("quizAvancar").textContent = "Responder";

  const caixa = $("quizOpcoes");
  caixa.innerHTML = "";
  pergunta.alternativas.forEach((alternativa, indice) => {
    const botao = document.createElement("button");
    botao.className = "opcao";
    botao.type = "button";
    botao.textContent = alternativa;
    botao.addEventListener("click", () => {
      if (quizRespondida) return;
      quizEscolha = indice;
      for (const outro of caixa.children) delete outro.dataset.escolhida;
      botao.dataset.escolhida = "true";
    });
    caixa.append(botao);
  });

  abrirFolha("folhaQuiz");
}

function avancarQuiz() {
  const pergunta = quiz[quizIndice];
  const opcoes = [...$("quizOpcoes").children];

  if (!quizRespondida) {
    if (quizEscolha < 0) { $("quizRetorno").textContent = "Escolha uma alternativa para continuar."; return; }

    quizRespondida = true;
    const acertou = quizEscolha === pergunta.correta;
    if (acertou) quizAcertos++;

    opcoes.forEach((opcao, indice) => {
      opcao.disabled = true;
      if (indice === pergunta.correta) opcao.dataset.certa = "true";
      else if (indice === quizEscolha) opcao.dataset.errada = "true";
    });

    $("quizRetorno").textContent = acertou ? "Correto." : `A palavra era “${pergunta.resposta}”.`;
    $("quizAvancar").textContent = quizIndice + 1 < quiz.length ? "Próxima" : "Ver resultado";
    return;
  }

  quizIndice++;
  if (quizIndice < quiz.length) { mostrarPergunta(); return; }

  fecharFolha("folhaQuiz");
  const percentual = percentualDeAcerto(quizAcertos, quiz.length);

  if (modoTeste) { concluirTeste(percentual); return; }

  // A referência precisa ser guardada antes: concluirSessao zera a sessão pendente.
  const sessao = sessaoPendente;
  sessao.retencao = percentual;
  concluirSessao(sessao);
  mostrarResultado("Sessão registrada", sessao, percentual);
}

function concluirSessao(sessao) {
  registrarSessao(perfil, sessao);
  guardarPosicao();
  salvarPerfil(perfil);
  leitor.zerarSessao();
  sessaoPendente = null;
}

function mostrarResultado(titulo, sessao, retencao) {
  $("resultadoTitulo").textContent = titulo;
  $("resultadoLinha").textContent =
    `${sessao.palavras.toLocaleString("pt-BR")} palavras · ${(sessao.segundos / 60).toFixed(1)} min · ${ppmEfetivo(sessao)} ppm`;
  $("resultadoVeredito").textContent = retencao === null
    ? "O trecho era curto demais para o teste de compreensão."
    : `Retenção de ${retencao}%. ${vereditoDe(retencao)}`;
  abrirFolha("folhaResultado");
}

// ================================================================ teste de velocidade

function comecarTeste() {
  documento = prepararTexto("Teste de velocidade", TEXTO_DO_TESTE);
  livroAtual = null;
  modoTeste = true;

  fecharFolha("folhaAjustes");
  $("palavra").hidden = true;
  $("palcoVazio").hidden = true;
  $("leitorTitulo").textContent = "Teste de velocidade";
  $("leitorCapitulo").textContent = "Leia no seu ritmo normal";

  abrirTextoNormal();
  $("focarAqui").textContent = "Terminei de ler";
  comecarTeste.inicio = performance.now();
  avisar("Leia o texto inteiro no seu ritmo e toque em “Terminei de ler”.", 5000);
}

function encerrarTeste() {
  const segundos = (performance.now() - (comecarTeste.inicio ?? performance.now())) / 1000;
  if (segundos < 15) { avisar("Leia o texto inteiro antes de encerrar o teste."); return; }

  const ppm = Math.round(documento.total / (segundos / 60));
  perfil.ppmInicial = Math.min(Math.max(ppm, 100), PPM_MAXIMO);
  perfil.ppmMedidoEm = new Date().toISOString();
  perfil.passosFeitos = 0;

  quiz = montarQuiz(documento, 0, documento.total, 3);
  if (quiz.length === 0) { concluirTeste(null); return; }

  quizIndice = 0;
  quizAcertos = 0;
  app.dataset.tela = "leitor";
  mostrarPergunta();
}

function concluirTeste(retencao) {
  salvarPerfil(perfil);
  modoTeste = false;
  documento = null;
  fecharFolha("folhaQuiz");

  $("resultadoTitulo").textContent = `Velocidade inicial: ${perfil.ppmInicial} ppm`;
  $("resultadoLinha").textContent = retencao === null ? "" : `Retenção de ${retencao}%`;
  $("resultadoVeredito").textContent =
    "Seu plano de 14 dias já está montado em Progresso." + (retencao === null ? "" : ` ${vereditoDe(retencao)}`);
  abrirFolha("folhaResultado");

  $("palavra").hidden = true;
  $("palcoVazio").hidden = false;
  $("focarAqui").textContent = "Começar o foco aqui";
  irPara("progresso");
}

// ================================================================ modo texto

function abrirTextoNormal() {
  if (!documento) { avisar("Abra um livro primeiro."); return; }

  leitor.pausar();
  const capitulo = capituloEm(documento, leitor.posicao);
  const inicio = capitulo?.inicio ?? 0;
  const fim = capitulo ? capitulo.inicio + capitulo.palavras : documento.total;

  $("textoTitulo").textContent = documento.titulo;
  const caixa = $("textoCorrido");
  caixa.innerHTML = "";

  if (capitulo) {
    const titulo = document.createElement("h3");
    titulo.textContent = capitulo.titulo;
    caixa.append(titulo);
  }

  let atual = null;
  for (const paragrafo of paragrafosDe(documento, inicio, fim)) {
    const p = document.createElement("p");
    p.textContent = paragrafo.texto;
    p.dataset.inicio = String(paragrafo.inicio);
    if (paragrafo.inicio <= leitor.posicao) atual = p;
    p.addEventListener("click", () => {
      for (const outro of caixa.querySelectorAll("p")) delete outro.dataset.atual;
      p.dataset.atual = "true";
      leitor.irPara(paragrafo.inicio);
    });
    caixa.append(p);
  }

  // Parar exatamente sobre o título do capítulo não casa com parágrafo nenhum: cai no primeiro.
  atual ??= caixa.querySelector("p");

  if (atual) {
    atual.dataset.atual = "true";
    requestAnimationFrame(() => atual.scrollIntoView({ block: "center" }));
  }

  irPara("texto");
}

function desenharCapitulos() {
  if (!documento) return;
  const lista = $("listaCapitulos");
  lista.innerHTML = "";
  const atual = capituloEm(documento, leitor.posicao);

  for (const capitulo of documento.capitulos) {
    const item = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.innerHTML = "<b></b><span></span>";
    botao.querySelector("b").textContent = String(capitulo.indice + 1).padStart(2, "0");
    botao.querySelector("span").textContent = capitulo.titulo;
    if (atual && capitulo.indice === atual.indice) botao.dataset.atual = "true";
    botao.addEventListener("click", () => {
      leitor.irPara(capitulo.inicio);
      fecharFolha("folhaCapitulos");
      abrirTextoNormal();
    });
    item.append(botao);
    lista.append(item);
  }

  abrirFolha("folhaCapitulos");
}

// ================================================================ progresso

function desenharProgresso() {
  const e = calcularEstatisticas(perfil);
  const plano = montarPlano(perfil);
  const meta = Math.max(perfil.metas.minutosPorDia, 1);

  const fracao = Math.min(e.minutosHoje / meta, 1);
  $("anelPreenchido").style.strokeDashoffset = String(270 - 270 * fracao);
  $("anelMinutos").textContent = String(Math.floor(e.minutosHoje));
  $("anelMeta").textContent = `de ${meta} min`;

  $("ofensivaDias").textContent = String(e.ofensiva);
  $("ofensivaDias").nextElementSibling.textContent = e.ofensiva === 1 ? "dia" : "dias";
  $("ofensivaDetalhe").textContent = e.ofensivaRecorde > 0
    ? `Recorde: ${plural(e.ofensivaRecorde, "dia", "dias")} · um dia perdido por semana é perdoado`
    : "Comece hoje";

  $("incentivo").textContent = fraseDeIncentivo(perfil, e);
  $("numPpm").textContent = e.ppmMedio || "—";
  $("numRetencao").textContent = e.retencaoMedia === null ? "—" : `${e.retencaoMedia}%`;
  $("numRecorde").textContent = e.ppmRecorde || "—";
  $("numLivros").textContent = livrosPorAno(e) || "—";

  $("planoContagem").textContent = `${plano.feitos} de ${DIAS_DO_PLANO}`;
  $("planoResumo").textContent = plano.proximo
    ? `Próxima sessão: ${plano.proximo.minutos} minutos a ${plano.proximo.ppm} ppm. ${plano.proximo.foco}.`
    : "Plano concluído. Refaça o teste de velocidade para começar o próximo ciclo.";

  const trilha = $("trilha");
  trilha.innerHTML = "";
  for (const passo of plano.passos) {
    const item = document.createElement("li");
    item.dataset.feito = String(passo.feito);
    item.dataset.agora = String(plano.proximo?.dia === passo.dia);
    item.innerHTML = `<span class="trilha__marca"></span>
      <span class="trilha__dados"><strong></strong><span></span></span>`;
    item.querySelector(".trilha__marca").textContent = passo.feito ? "✓" : String(passo.dia);
    item.querySelector("strong").textContent = `${passo.ppm} ppm · ${passo.minutos} min`;
    item.querySelector(".trilha__dados span").textContent = passo.foco;
    trilha.append(item);
  }

  const caixa = $("conquistas");
  caixa.innerHTML = "";
  for (const conquista of conquistas(perfil, e)) {
    const bloco = document.createElement("div");
    bloco.className = "conquista";
    bloco.dataset.ok = String(conquista.conquistada);
    bloco.innerHTML = `<span class="conquista__icone"></span><strong></strong><span></span>`;
    bloco.querySelector(".conquista__icone").textContent = conquista.icone;
    bloco.querySelector("strong").textContent = conquista.titulo;
    bloco.querySelector(".conquista span:last-child").textContent = conquista.detalhe;
    caixa.append(bloco);
  }

  $("metaMinutos").value = String(perfil.metas.minutosPorDia);
  $("metaPpm").value = String(perfil.metas.ppm);
  desenharNuvem();

  const sessoes = [...perfil.sessoes].reverse().slice(0, 8);
  const lista = $("sessoes");
  lista.innerHTML = "";
  $("sessoesVazio").hidden = sessoes.length > 0;
  for (const sessao of sessoes) {
    const item = document.createElement("li");
    item.innerHTML = "<span><strong></strong><small></small></span><b></b>";
    item.querySelector("strong").textContent = sessao.titulo;
    item.querySelector("small").textContent = new Date(sessao.terminadaEm)
      .toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    item.querySelector("b").textContent = `${ppmEfetivo(sessao)} ppm`;
    lista.append(item);
  }
}

// ================================================================ nuvem

let primeiroAcessoPendente = false;

function desenharNuvem() {
  $("blocoNuvem").hidden = !nuvem.configurada();
  if (!nuvem.configurada()) return;

  const ligada = nuvem.conectada();
  $("nuvemEstado").textContent = ligada ? "ligada" : "desligada";
  $("nuvemEntrar").hidden = ligada;
  $("nuvemSincronizar").hidden = !ligada;
  $("nuvemSair").hidden = !ligada;
  $("nuvemNota").textContent = ligada
    ? "O progresso é guardado fora do aparelho. Os livros da nuvem aparecem na estante."
    : "Entrar guarda o progresso fora do aparelho e libera os livros que não estão no repositório.";
}

async function abrirAcesso() {
  $("acessoErro").textContent = "";
  $("acessoSenha").value = "";

  try {
    const { configurado } = await nuvem.estado();
    primeiroAcessoPendente = !configurado;
  } catch (erro) {
    // Nuvem fora do ar ou ainda não publicada: dizer isso é melhor que oferecer um login que falha.
    primeiroAcessoPendente = false;
    $("acessoErro").textContent = `${erro.message} Você pode continuar lendo sem sincronizar.`;
  }

  $("acessoTitulo").textContent = primeiroAcessoPendente ? "Criar senha" : "Entrar";
  $("acessoConfirmar").textContent = primeiroAcessoPendente ? "Criar senha" : "Entrar";
  $("acessoSenha").setAttribute("autocomplete", primeiroAcessoPendente ? "new-password" : "current-password");
  abrirFolha("folhaAcesso");
  $("acessoSenha").focus();
}

async function confirmarAcesso(evento) {
  evento.preventDefault();
  const senha = $("acessoSenha").value;

  if (senha.length < 8) { $("acessoErro").textContent = "A senha precisa de pelo menos 8 caracteres."; return; }

  $("acessoConfirmar").disabled = true;
  try {
    if (primeiroAcessoPendente) await nuvem.primeiroAcesso(senha);
    else await nuvem.entrar(senha);

    fecharFolha("folhaAcesso");
    await sincronizar();
    await iniciarEstante();
    desenharNuvem();
    desenharProgresso();
    irPara("estante");
    avisar("Estante liberada.");
  } catch (erro) {
    $("acessoErro").textContent = erro.message;
  } finally {
    $("acessoConfirmar").disabled = false;
  }
}

/**
 * Junta este aparelho com a nuvem e devolve o resultado para os dois lados. A fusão soma histórico
 * e biblioteca em vez de deixar o mais recente vencer — senão ler no celular apagaria o que foi
 * lido no computador enquanto ele estava fechado.
 */
async function sincronizar() {
  if (!nuvem.conectada()) return;

  try {
    const { perfil: remoto, atualizadoEm } = await nuvem.baixarPerfil();
    const remotoEhMaisNovo = Boolean(atualizadoEm)
      && (!perfil.atualizadoEm || new Date(atualizadoEm) > new Date(perfil.atualizadoEm));

    perfil = mesclarPerfis(perfil, remoto, remotoEhMaisNovo);
    salvarPerfil(perfil);
    await nuvem.enviarPerfil(perfil);
    aplicarAjustes();
    avisar("Progresso sincronizado.");
  } catch (erro) {
    avisar(erro.message ?? "Não foi possível sincronizar agora.");
  }
}

/** Envia o perfil sem travar a interface; falhar aqui é normal e não é erro do usuário. */
function sincronizarEmSegundoPlano() {
  if (!nuvem.conectada()) return;
  nuvem.enviarPerfil(perfil).catch(() => {
    // Offline ou nuvem fora do ar: o que está no aparelho continua valendo.
  });
}

// ================================================================ ajustes

function aplicarAjustes() {
  const a = perfil.ajustes;
  document.documentElement.dataset.tema = a.tema;
  document.documentElement.dataset.fonte = a.fonte;
  document.documentElement.style.setProperty("--escala-leitura", String(a.tamanho));

  leitor.definirTamanhoDoBloco(a.blocos);
  leitor.definirPush(a.pushMode);
  leitor.definirAutoCapitulo(a.autoCapitulo);
  leitor.definirRegressao(a.regressaoAoRetomar);
  ambiente.definirVolume(a.volume);

  $("chavePush").checked = a.pushMode;
  $("chaveCapitulo").checked = a.autoCapitulo;
  $("chaveRegressao").checked = a.regressaoAoRetomar;
  $("faixaVolume").value = String(Math.round(a.volume * 100));
  marcarSegmento("segBlocos", String(a.blocos));
  marcarSegmento("segFonte", a.fonte);
  marcarSegmento("segTamanho", String(a.tamanho));
  marcarSegmento("segTema", a.tema);
  marcarSegmento("segSom", a.som);
}

function marcarSegmento(id, valor) {
  const grupo = $(id);
  if (!grupo) return;
  grupo.dataset.valor = valor;
  for (const botao of grupo.children) botao.dataset.ativo = String(botao.dataset.valor === valor);
}

function ligarSegmento(id, aoEscolher) {
  $(id).addEventListener("click", (evento) => {
    const botao = evento.target.closest("button");
    if (!botao) return;
    marcarSegmento(id, botao.dataset.valor);
    aoEscolher(botao.dataset.valor);
    salvarPerfil(perfil);
  });
}

function montarListaDeSons() {
  const grupo = $("segSom");
  grupo.innerHTML = "";
  for (const faixa of faixasDisponiveis()) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.dataset.valor = faixa.id;
    botao.textContent = faixa.detalhe ? `${faixa.nome} — ${faixa.detalhe}` : faixa.nome;
    grupo.append(botao);
  }
}

// ================================================================ gestos e teclado

function ligarGestos() {
  const palco = $("palco");
  let inicioX = 0;
  let inicioY = 0;
  let tempo = 0;

  palco.addEventListener("pointerdown", (evento) => {
    inicioX = evento.clientX;
    inicioY = evento.clientY;
    tempo = performance.now();
  });

  palco.addEventListener("pointerup", (evento) => {
    if (!documento || modoTeste) return;

    const dx = evento.clientX - inicioX;
    const dy = evento.clientY - inicioY;
    const duracao = performance.now() - tempo;

    if (Math.abs(dx) < 34 && Math.abs(dy) < 34 && duracao < 500) { leitor.alternar(); return; }

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 40) leitor.voltarFrase();
      else if (dx < -40) leitor.pularCapitulo();
    } else {
      const passo = dy < 0 ? 20 : -20;
      const novo = leitor.ppmBase + passo;
      leitor.definirPpm(novo);
      $("faixaPpm").value = String(leitor.ppmBase);
      $("valorPpm").textContent = `${leitor.ppmBase} ppm`;
      perfil.ultimoPpm = leitor.ppmBase;
    }
    atualizarMedidores();
  });

  document.addEventListener("keydown", (evento) => {
    if (app.dataset.tela !== "leitor") return;
    if (evento.target.matches("input, textarea")) return;
    if (!$("folhaAjustes").hidden || !$("folhaQuiz").hidden) return;

    const acoes = {
      " ": () => leitor.alternar(),
      ArrowLeft: () => leitor.voltarFrase(),
      ArrowRight: () => leitor.pularCapitulo(),
      ArrowUp: () => leitor.definirPpm(leitor.ppmBase + 20),
      ArrowDown: () => leitor.definirPpm(leitor.ppmBase - 20),
    };

    const acao = acoes[evento.key];
    if (!acao) return;
    evento.preventDefault();
    acao();
    $("faixaPpm").value = String(leitor.ppmBase);
    $("valorPpm").textContent = `${leitor.ppmBase} ppm`;
    atualizarMedidores();
  });
}

// ================================================================ ligação

function ligarInterface() {
  $("abas").addEventListener("click", (evento) => {
    const botao = evento.target.closest("button");
    if (botao) irPara(botao.dataset.ir);
  });

  $("irParaEstante").addEventListener("click", () => irPara("estante"));
  $("voltarParaEstante").addEventListener("click", () => irPara("estante"));
  $("botaoTocar").addEventListener("click", () => leitor.alternar());
  $("botaoFrase").addEventListener("click", () => { leitor.voltarFrase(); atualizarMedidores(); });
  $("botaoCapitulo").addEventListener("click", () => { leitor.pularCapitulo(); atualizarMedidores(); });
  $("botaoTextoNormal").addEventListener("click", abrirTextoNormal);
  $("botaoEncerrar").addEventListener("click", encerrarSessao);

  $("fecharTexto").addEventListener("click", () => {
    if (modoTeste) { encerrarTeste(); return; }
    irPara("leitor");
  });
  $("abrirCapitulos").addEventListener("click", desenharCapitulos);
  $("fecharCapitulos").addEventListener("click", () => fecharFolha("folhaCapitulos"));
  $("focarAqui").addEventListener("click", () => {
    if (modoTeste) { encerrarTeste(); return; }
    irPara("leitor");
    leitor.iniciar();
  });

  $("abrirAjustes").addEventListener("click", () => abrirFolha("folhaAjustes"));
  $("fecharAjustes").addEventListener("click", () => fecharFolha("folhaAjustes"));
  $("botaoTeste").addEventListener("click", comecarTeste);

  $("quizAvancar").addEventListener("click", avancarQuiz);
  $("fecharResultado").addEventListener("click", () => {
    fecharFolha("folhaResultado");
    sincronizarEmSegundoPlano();
    desenharProgresso();
  });

  $("nuvemEntrar").addEventListener("click", abrirAcesso);
  $("conviteEntrar").addEventListener("click", abrirAcesso);
  $("fecharAcesso").addEventListener("click", () => fecharFolha("folhaAcesso"));
  $("formAcesso").addEventListener("submit", confirmarAcesso);
  $("nuvemSincronizar").addEventListener("click", async () => {
    await sincronizar();
    await iniciarEstante();
    desenharProgresso();
  });
  $("nuvemSair").addEventListener("click", () => {
    nuvem.desconectar();
    desenharNuvem();
    iniciarEstante();
    avisar("Sessão encerrada neste aparelho. O progresso local continua aqui.");
  });

  for (const folha of document.querySelectorAll(".folha--ajustes, .folha--capitulos")) {
    folha.addEventListener("click", (evento) => {
      if (evento.target === folha) folha.hidden = true;
    });
  }

  $("faixaPpm").addEventListener("input", (evento) => {
    const ppm = Number(evento.target.value);
    leitor.definirPpm(ppm);
    $("valorPpm").textContent = `${ppm} ppm`;
    perfil.ultimoPpm = ppm;
    atualizarMedidores();
  });
  $("faixaPpm").addEventListener("change", () => salvarPerfil(perfil));

  $("chavePush").addEventListener("change", (e) => {
    perfil.ajustes.pushMode = e.target.checked;
    leitor.definirPush(e.target.checked);
    salvarPerfil(perfil);
  });
  $("chaveCapitulo").addEventListener("change", (e) => {
    perfil.ajustes.autoCapitulo = e.target.checked;
    leitor.definirAutoCapitulo(e.target.checked);
    salvarPerfil(perfil);
  });
  $("chaveRegressao").addEventListener("change", (e) => {
    perfil.ajustes.regressaoAoRetomar = e.target.checked;
    leitor.definirRegressao(e.target.checked);
    salvarPerfil(perfil);
  });

  $("faixaVolume").addEventListener("input", (e) => {
    perfil.ajustes.volume = Number(e.target.value) / 100;
    ambiente.definirVolume(perfil.ajustes.volume);
  });
  $("faixaVolume").addEventListener("change", () => salvarPerfil(perfil));

  ligarSegmento("segBlocos", (valor) => {
    perfil.ajustes.blocos = Number(valor);
    leitor.definirTamanhoDoBloco(Number(valor));
  });
  ligarSegmento("segFonte", (valor) => {
    perfil.ajustes.fonte = valor;
    document.documentElement.dataset.fonte = valor;
  });
  ligarSegmento("segTamanho", (valor) => {
    perfil.ajustes.tamanho = Number(valor);
    document.documentElement.style.setProperty("--escala-leitura", valor);
  });
  ligarSegmento("segTema", (valor) => {
    perfil.ajustes.tema = valor;
    document.documentElement.dataset.tema = valor;
    document.querySelector('meta[name="theme-color"]')
      .setAttribute("content", valor === "papel" ? "#E9DFC9" : "#0C0D11");
  });
  ligarSegmento("segSom", (valor) => {
    perfil.ajustes.som = valor;
    ambiente.definirFaixa(valor);
  });

  $("salvarMetas").addEventListener("click", () => {
    const minutos = Number($("metaMinutos").value);
    const ppm = Number($("metaPpm").value);
    if (!Number.isFinite(minutos) || minutos < 5 || minutos > 240) { avisar("Minutos por dia: entre 5 e 240."); return; }
    if (!Number.isFinite(ppm) || ppm < 150 || ppm > PPM_MAXIMO) { avisar(`PPM: entre 150 e ${PPM_MAXIMO}.`); return; }
    perfil.metas.minutosPorDia = minutos;
    perfil.metas.ppm = ppm;
    salvarPerfil(perfil);
    desenharProgresso();
    avisar("Metas salvas. O plano foi remontado.");
  });

  // Sair do app no meio da leitura não pode perder a posição.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { leitor.pausar(); guardarPosicao(); }
  });
  window.addEventListener("pagehide", guardarPosicao);
}

// ================================================================ início

montarListaDeSons();
ligarInterface();
ligarGestos();
aplicarAjustes();
leitor.definirPpm(perfil.ultimoPpm || 300);
$("faixaPpm").value = String(leitor.ppmBase);
$("valorPpm").textContent = `${leitor.ppmBase} ppm`;
irPara("estante");
desenharNuvem();

(async () => {
  // A sincronização vem antes da estante: os livros da nuvem só aparecem depois de entrar.
  await sincronizar();
  await iniciarEstante();
})();

// Em desenvolvimento o service worker atrapalha mais do que ajuda: ele devolve a versão guardada e
// esconde o que acabou de mudar. Ele só entra em produção.
const emDesenvolvimento = ["localhost", "127.0.0.1"].includes(location.hostname);

if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !emDesenvolvimento) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Sem service worker o app continua funcionando, só não fica disponível offline.
  });
}
