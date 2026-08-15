// O motor da leitura dinâmica. Não toca no DOM: ele só decide o que mostrar e por quanto tempo,
// e avisa a interface. Assim o ritmo pode ser conferido sem abrir o navegador.

import {
  agruparEmBlocos,
  duracaoDe,
  inicioDaFraseAnterior,
  proximoCapitulo,
  PPM_MINIMO,
  PPM_MAXIMO,
} from "./texto.js";

const CONTAGEM_REGRESSIVA = 3;
const PALAVRAS_DE_REGRESSAO = 4;
const INTERVALO_DO_PUSH = 45000;
const PASSO_DO_PUSH = 1.04;
const TETO_DO_PUSH = 1.6;

export class Leitor {
  #documento = null;
  #blocos = [];
  #posicao = 0;
  #tamanhoDoBloco = 1;
  #ppm = 300;
  #ppmBase = 300;
  #push = false;
  #autoCapitulo = true;
  #regressao = true;

  #tocando = false;
  #timer = null;
  #alvo = 0;
  #inicioAtivo = 0;
  #acumulado = 0;
  #inicioDaSessao = 0;
  #ultimoPush = 0;
  #travaDeTela = null;

  constructor(eventos = {}) {
    this.eventos = eventos;
  }

  get documento() { return this.#documento; }
  get posicao() { return this.#posicao; }
  get tocando() { return this.#tocando; }
  get ppm() { return Math.round(this.#ppm); }
  get ppmBase() { return this.#ppmBase; }
  get inicioDaSessao() { return this.#inicioDaSessao; }

  /** Segundos de leitura de verdade — o tempo pausado não conta. */
  get segundosLidos() {
    const ativo = this.#tocando ? performance.now() - this.#inicioAtivo : 0;
    return (this.#acumulado + ativo) / 1000;
  }

  get palavrasLidas() {
    return Math.max(this.#posicao - this.#inicioDaSessao, 0);
  }

  carregar(documento, posicao = 0) {
    this.pausar();
    this.#documento = documento;
    this.#posicao = Math.min(Math.max(posicao, 0), Math.max(documento.total - 1, 0));
    this.#inicioDaSessao = this.#posicao;
    this.#acumulado = 0;
    this.#reagrupar();
    this.#anunciar();
  }

  definirTamanhoDoBloco(tamanho) {
    this.#tamanhoDoBloco = Math.min(Math.max(tamanho, 1), 3);
    if (this.#documento) {
      this.#reagrupar();
      this.#anunciar();
    }
  }

  definirPpm(ppm) {
    this.#ppmBase = Math.min(Math.max(Math.round(ppm), PPM_MINIMO), PPM_MAXIMO);
    this.#ppm = this.#ppmBase;
    this.#ultimoPush = performance.now();
    this.eventos.onVelocidade?.(this.ppm);
  }

  definirPush(ligado) {
    this.#push = ligado;
    this.#ppm = this.#ppmBase;
    this.#ultimoPush = performance.now();
    this.eventos.onVelocidade?.(this.ppm);
  }

  definirAutoCapitulo(ligado) { this.#autoCapitulo = ligado; }

  definirRegressao(ligado) { this.#regressao = ligado; }

  irPara(posicao) {
    const destino = Math.min(Math.max(posicao, 0), Math.max((this.#documento?.total ?? 1) - 1, 0));
    this.#posicao = destino;
    if (destino < this.#inicioDaSessao) this.#inicioDaSessao = destino;
    this.#anunciar();
  }

  voltarFrase() {
    if (!this.#documento) return;
    this.irPara(inicioDaFraseAnterior(this.#documento, this.#posicao));
  }

  pularCapitulo() {
    if (!this.#documento) return;
    this.irPara(proximoCapitulo(this.#documento, this.#posicao));
  }

  alternar() {
    if (this.#tocando) this.pausar();
    else this.iniciar();
  }

  /**
   * Começa com uma contagem curta. Sem ela, as três primeiras palavras se perdem enquanto o olho
   * ainda procura o ponto de foco — e são justamente elas que dão o contexto da frase.
   */
  async iniciar() {
    if (!this.#documento || this.#tocando) return;
    if (this.#posicao >= this.#documento.total - 1) return;

    // Ao retomar, recuar algumas palavras devolve o fio que a pausa cortou.
    if (this.#regressao && this.#acumulado > 0) {
      this.#posicao = Math.max(this.#posicao - PALAVRAS_DE_REGRESSAO, 0);
      this.#anunciar();
    }

    if (this.eventos.onContagem) {
      for (let n = CONTAGEM_REGRESSIVA; n >= 1; n--) {
        this.eventos.onContagem(n);
        await esperar(600);
        if (this.#tocando) return;
      }
      this.eventos.onContagem(0);
    }

    this.#tocando = true;
    this.#inicioAtivo = performance.now();
    this.#ultimoPush = performance.now();
    this.#alvo = performance.now();
    this.#pedirTravaDeTela();
    this.eventos.onEstado?.(true);
    this.#passo();
  }

  pausar() {
    if (!this.#tocando) {
      clearTimeout(this.#timer);
      return;
    }

    clearTimeout(this.#timer);
    this.#acumulado += performance.now() - this.#inicioAtivo;
    this.#tocando = false;
    this.#ppm = this.#ppmBase;
    this.#soltarTravaDeTela();
    this.eventos.onEstado?.(false);
    this.eventos.onVelocidade?.(this.ppm);
    this.#anunciar();
  }

  zerarSessao() {
    this.#acumulado = 0;
    this.#inicioDaSessao = this.#posicao;
  }

  #passo() {
    if (!this.#tocando || !this.#documento) return;

    const indice = this.#blocoEm(this.#posicao);
    if (indice < 0 || indice >= this.#blocos.length) {
      this.pausar();
      this.eventos.onFim?.();
      return;
    }

    const bloco = this.#blocos[indice];
    this.eventos.onBloco?.(bloco, this.#posicao);

    if (this.#push) this.#aplicarPush();

    const duracao = duracaoDe(bloco, this.#ppm, this.#documento.ritmoMedio);
    // O alvo acumula em vez de reiniciar a cada palavra: sem isso o atraso de cada timer se soma
    // e a velocidade real fica bem abaixo da escolhida.
    this.#alvo += duracao;
    const espera = Math.max(this.#alvo - performance.now(), 0);

    this.#timer = setTimeout(() => {
      const proximo = bloco.fim + 1;

      if (proximo >= this.#documento.total) {
        this.#posicao = this.#documento.total;
        this.pausar();
        this.eventos.onFim?.();
        return;
      }

      const capituloAtual = this.#documento.palavras[this.#posicao]?.capitulo;
      const capituloNovo = this.#documento.palavras[proximo]?.capitulo;
      this.#posicao = proximo;

      if (!this.#autoCapitulo && capituloNovo !== capituloAtual) {
        this.pausar();
        this.eventos.onCapitulo?.(capituloNovo);
        return;
      }

      this.#passo();
    }, espera);
  }

  /** Push Mode: a velocidade sobe sozinha durante a sessão, até um teto sobre a base escolhida. */
  #aplicarPush() {
    const agora = performance.now();
    if (agora - this.#ultimoPush < INTERVALO_DO_PUSH) return;

    this.#ultimoPush = agora;
    const teto = Math.min(this.#ppmBase * TETO_DO_PUSH, PPM_MAXIMO);
    this.#ppm = Math.min(this.#ppm * PASSO_DO_PUSH, teto);
    this.eventos.onVelocidade?.(this.ppm);
  }

  #reagrupar() {
    this.#blocos = agruparEmBlocos(this.#documento.palavras, this.#tamanhoDoBloco);
  }

  #blocoEm(posicao) {
    let baixo = 0;
    let alto = this.#blocos.length - 1;
    while (baixo <= alto) {
      const meio = (baixo + alto) >> 1;
      const bloco = this.#blocos[meio];
      if (posicao < bloco.inicio) alto = meio - 1;
      else if (posicao > bloco.fim) baixo = meio + 1;
      else return meio;
    }
    return baixo < this.#blocos.length ? baixo : -1;
  }

  #anunciar() {
    if (!this.#documento) return;
    const indice = this.#blocoEm(this.#posicao);
    if (indice >= 0 && indice < this.#blocos.length) {
      this.eventos.onBloco?.(this.#blocos[indice], this.#posicao);
    }
  }

  /** Sem isso a tela do celular apaga no meio da leitura e a sessão morre junto. */
  async #pedirTravaDeTela() {
    try {
      if ("wakeLock" in navigator) {
        this.#travaDeTela = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Aparelho sem suporte ou bateria fraca: a leitura continua, só a tela pode apagar.
    }
  }

  #soltarTravaDeTela() {
    try { this.#travaDeTela?.release(); } catch { /* já solta */ }
    this.#travaDeTela = null;
  }
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
