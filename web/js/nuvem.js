// Conversa com a Edge Function: entrar, sincronizar o perfil e buscar os livros que não estão no
// repositório.
//
// A senha fica no aparelho e vai em um cabeçalho a cada chamada. Ela nunca é guardada no servidor —
// lá existe só o hash. Se a função não estiver configurada, o app inteiro continua funcionando sem
// nuvem, com os livros públicos e o progresso local.

const ENDERECO = "https://agsfaaertvwyrlqeywzn.supabase.co/functions/v1/gabinete";
const CHAVE_SENHA = "leitura.senha.v1";

export function configurada() {
  return ENDERECO.startsWith("https://") && !ENDERECO.includes("SEU-PROJETO");
}

export function conectada() {
  return Boolean(senhaGuardada());
}

function senhaGuardada() {
  try { return localStorage.getItem(CHAVE_SENHA); } catch { return null; }
}

function guardarSenha(senha) {
  try { localStorage.setItem(CHAVE_SENHA, senha); } catch { /* modo privado */ }
}

export function desconectar() {
  try { localStorage.removeItem(CHAVE_SENHA); } catch { /* modo privado */ }
}

async function chamar(rota, { metodo = "GET", corpo = null, senha = null } = {}) {
  if (!configurada()) throw new Error("A nuvem ainda não foi configurada neste app.");

  const cabecalhos = { "Content-Type": "application/json" };
  const chave = senha ?? senhaGuardada();
  if (chave) cabecalhos["x-gabinete-senha"] = chave;

  let resposta;
  try {
    resposta = await fetch(`${ENDERECO}/${rota}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error("Sem conexão com a nuvem.");
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    // A senha errada precisa derrubar a sessão local, senão o app fica tentando para sempre.
    if (resposta.status === 401) desconectar();
    throw new Error(dados.erro ?? `A nuvem respondeu com o erro ${resposta.status}.`);
  }
  return dados;
}

export const estado = () => chamar("estado");

export async function primeiroAcesso(senha) {
  await chamar("primeiro-acesso", { metodo: "POST", corpo: { senha } });
  guardarSenha(senha);
}

export async function entrar(senha) {
  await chamar("entrar", { metodo: "POST", corpo: { senha }, senha });
  guardarSenha(senha);
}

export const baixarPerfil = () => chamar("perfil");
export const enviarPerfil = (perfil) => chamar("perfil", { metodo: "PUT", corpo: perfil });
export const catalogoRemoto = () => chamar("catalogo");
export const livroRemoto = (id) => chamar(`livro?id=${encodeURIComponent(id)}`);
export const artigoRemoto = (url) => chamar("artigo", { metodo: "POST", corpo: { url } });
