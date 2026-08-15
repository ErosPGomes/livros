// Som de fundo para a sessão de leitura.
//
// O objetivo não é trilha sonora: é máscara. Um fundo contínuo e sem letra reduz a chance de a voz
// interna acompanhar a leitura — o hábito que trava a maioria dos leitores perto de 150 ppm.
// Qualquer coisa cantada faria o contrário, porque disputaria o mesmo canal verbal.
//
// Por isso o som é sintetizado na hora, com a Web Audio API, em vez de vir de arquivos: nada para
// baixar, funciona offline, não pesa no repositório e não depende de licença de música.

const FAIXAS = {
  nenhum: { nome: "Sem som" },
  bruma: { nome: "Bruma", detalhe: "ruído grave e contínuo" },
  cordas: { nome: "Cordas", detalhe: "acorde longo, quase parado" },
  chuva: { nome: "Chuva", detalhe: "chuva fina constante" },
};

export function faixasDisponiveis() {
  return Object.entries(FAIXAS).map(([id, dados]) => ({ id, ...dados }));
}

export class Ambiente {
  #contexto = null;
  #mestre = null;
  #vozes = [];
  #faixa = "nenhum";
  #volume = 0.25;

  get faixa() {
    return this.#faixa;
  }

  async definirFaixa(faixa) {
    if (faixa === this.#faixa) return;
    this.#faixa = faixa;
    this.parar();
    if (faixa !== "nenhum") await this.tocar();
  }

  definirVolume(volume) {
    this.#volume = Math.min(Math.max(volume, 0), 1);
    if (this.#mestre) {
      this.#mestre.gain.setTargetAtTime(this.#volume * 0.35, this.#contexto.currentTime, 0.2);
    }
  }

  async tocar() {
    if (this.#faixa === "nenhum" || this.#vozes.length > 0) return;

    // O contexto só pode nascer depois de um toque do usuário — regra do navegador.
    this.#contexto ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (this.#contexto.state === "suspended") await this.#contexto.resume();

    this.#mestre = this.#contexto.createGain();
    this.#mestre.gain.value = 0;
    this.#mestre.connect(this.#contexto.destination);

    if (this.#faixa === "bruma") this.#construirBruma();
    else if (this.#faixa === "cordas") this.#construirCordas();
    else if (this.#faixa === "chuva") this.#construirChuva();

    // Entrada em rampa: som que começa seco assusta e quebra a concentração.
    this.#mestre.gain.setTargetAtTime(this.#volume * 0.35, this.#contexto.currentTime, 1.5);
  }

  parar() {
    if (!this.#contexto) return;

    if (this.#mestre) {
      this.#mestre.gain.setTargetAtTime(0, this.#contexto.currentTime, 0.4);
      const saindo = this.#mestre;
      const vozes = this.#vozes;
      setTimeout(() => {
        for (const voz of vozes) {
          try { voz.stop?.(); } catch { /* já parou */ }
          try { voz.disconnect(); } catch { /* já desligou */ }
        }
        try { saindo.disconnect(); } catch { /* já desligou */ }
      }, 1200);
    }

    this.#vozes = [];
    this.#mestre = null;
  }

  /** Ruído marrom: grave, sem chiado agudo, o mais próximo de "silêncio com corpo". */
  #construirBruma() {
    const fonte = this.#criarRuido((anterior, branco) => {
      const valor = (anterior + 0.02 * branco) / 1.02;
      return [valor, valor * 3.5];
    });

    const filtro = this.#contexto.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 420;

    fonte.connect(filtro).connect(this.#mestre);
    this.#vozes.push(fonte, filtro);
  }

  /** Acorde longo e imóvel, com batimento lento entre osciladores desafinados de propósito. */
  #construirCordas() {
    const filtro = this.#contexto.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 900;
    filtro.Q.value = 0.6;
    filtro.connect(this.#mestre);

    // Lá menor aberto, em oitava grave: sem tensão, sem resolução, nada que peça atenção.
    for (const frequencia of [110, 164.81, 220, 329.63]) {
      for (const desvio of [-0.6, 0.6]) {
        const oscilador = this.#contexto.createOscillator();
        oscilador.type = "sine";
        oscilador.frequency.value = frequencia + desvio;

        const ganho = this.#contexto.createGain();
        ganho.gain.value = frequencia > 200 ? 0.05 : 0.09;

        oscilador.connect(ganho).connect(filtro);
        oscilador.start();
        this.#vozes.push(oscilador, ganho);
      }
    }

    // Respiração muito lenta no brilho, para o acorde não soar sintético e parado demais.
    const lento = this.#contexto.createOscillator();
    lento.frequency.value = 0.05;
    const profundidade = this.#contexto.createGain();
    profundidade.gain.value = 260;
    lento.connect(profundidade).connect(filtro.frequency);
    lento.start();

    this.#vozes.push(lento, profundidade, filtro);
  }

  /** Chuva fina: ruído branco filtrado em faixa média, com variação lenta de intensidade. */
  #construirChuva() {
    const fonte = this.#criarRuido((anterior, branco) => [anterior, branco * 0.6]);

    const passaAlta = this.#contexto.createBiquadFilter();
    passaAlta.type = "highpass";
    passaAlta.frequency.value = 700;

    const passaBaixa = this.#contexto.createBiquadFilter();
    passaBaixa.type = "lowpass";
    passaBaixa.frequency.value = 6500;

    const corpo = this.#contexto.createGain();
    corpo.gain.value = 0.8;

    const lento = this.#contexto.createOscillator();
    lento.frequency.value = 0.08;
    const profundidade = this.#contexto.createGain();
    profundidade.gain.value = 0.18;
    lento.connect(profundidade).connect(corpo.gain);
    lento.start();

    fonte.connect(passaAlta).connect(passaBaixa).connect(corpo).connect(this.#mestre);
    this.#vozes.push(fonte, passaAlta, passaBaixa, corpo, lento, profundidade);
  }

  /**
   * Gera alguns segundos de ruído e toca em laço. Sai muito mais barato que um ScriptProcessor
   * rodando o tempo todo, o que importa quando o aparelho é um celular lendo por 20 minutos.
   */
  #criarRuido(passo) {
    const segundos = 6;
    const tamanho = this.#contexto.sampleRate * segundos;
    const buffer = this.#contexto.createBuffer(1, tamanho, this.#contexto.sampleRate);
    const canal = buffer.getChannelData(0);

    let anterior = 0;
    for (let i = 0; i < tamanho; i++) {
      const branco = Math.random() * 2 - 1;
      const [novoAnterior, amostra] = passo(anterior, branco);
      anterior = novoAnterior;
      canal[i] = amostra;
    }

    // Junta as pontas para o laço não estalar a cada volta.
    const costura = Math.floor(this.#contexto.sampleRate * 0.05);
    for (let i = 0; i < costura; i++) {
      const peso = i / costura;
      canal[i] = canal[i] * peso + canal[tamanho - costura + i] * (1 - peso);
    }

    const fonte = this.#contexto.createBufferSource();
    fonte.buffer = buffer;
    fonte.loop = true;
    fonte.start();
    return fonte;
  }
}
