// Edge Function do Gabinete.
//
// Ela existe por dois motivos que o GitHub Pages sozinho não resolve: guardar o progresso fora do
// aparelho (para o celular e o computador verem a mesma coisa) e servir o texto dos livros só para
// quem tem a senha — no Pages, qualquer arquivo publicado é público, então livro com direitos não
// pode morar lá.
//
// A senha nunca é guardada: vai e volta como cabeçalho e é comparada pelo hash SHA-256.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ORIGENS_PERMITIDAS = [
  "https://livros.erosgomes.com.br",
  "https://erospgomes.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const CABECALHO_SENHA = "x-gabinete-senha";
const MINIMO_DA_SENHA = 8;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (pedido) => {
  const origem = pedido.headers.get("origin") ?? "";
  const cors = montarCors(origem);

  if (pedido.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(pedido.url);
  // O caminho chega como /gabinete/rota; a função não sabe (nem precisa saber) o slug do deploy.
  const rota = url.pathname.split("/").filter(Boolean).slice(1).join("/") || "estado";

  try {
    switch (`${pedido.method} ${rota}`) {
      case "GET estado":       return responder(await estado(), cors);
      case "POST primeiro-acesso": return responder(await primeiroAcesso(pedido), cors);
      case "POST entrar":      return responder(await entrar(pedido), cors);
      case "GET perfil":       return responder(await lerPerfil(pedido), cors);
      case "PUT perfil":       return responder(await gravarPerfil(pedido), cors);
      case "GET catalogo":     return responder(await catalogo(pedido), cors);
      case "GET livro":        return responder(await livro(pedido, url), cors);
      case "PUT livro":        return responder(await gravarLivro(pedido), cors);
      case "DELETE livro":     return responder(await apagarLivro(pedido, url), cors);
      case "POST artigo":      return responder(await artigo(pedido), cors);
      default:
        return responder({ erro: "Rota desconhecida." }, cors, 404);
    }
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Erro inesperado.";
    const status = mensagem === "SENHA_INVALIDA" ? 401 : 400;
    return responder({ erro: status === 401 ? "Senha incorreta." : mensagem }, cors, status);
  }
});

// ---------------------------------------------------------------- rotas

/** Diz se a senha já foi criada, para o app saber se mostra "entrar" ou "primeiro acesso". */
async function estado() {
  const { data } = await supabase.from("gabinete_config").select("senha_hash").eq("id", 1).maybeSingle();
  return { configurado: Boolean(data?.senha_hash) };
}

async function primeiroAcesso(pedido: Request) {
  const { senha } = await pedido.json();
  if (typeof senha !== "string" || senha.length < MINIMO_DA_SENHA) {
    throw new Error(`A senha precisa de pelo menos ${MINIMO_DA_SENHA} caracteres.`);
  }

  const { data } = await supabase.from("gabinete_config").select("senha_hash").eq("id", 1).maybeSingle();
  if (data?.senha_hash) throw new Error("Já existe uma senha. Use entrar.");

  await supabase.from("gabinete_config")
    .upsert({ id: 1, senha_hash: await hash(senha) })
    .throwOnError();

  return { ok: true };
}

async function entrar(pedido: Request) {
  const { senha } = await pedido.json();
  await conferir(String(senha ?? ""));
  return { ok: true };
}

async function lerPerfil(pedido: Request) {
  await autorizar(pedido);
  const { data } = await supabase.from("gabinete_perfil").select("dados, atualizado_em").eq("id", 1).maybeSingle();
  return { perfil: data?.dados ?? null, atualizadoEm: data?.atualizado_em ?? null };
}

async function gravarPerfil(pedido: Request) {
  await autorizar(pedido);
  const corpo = await pedido.json();
  if (!corpo || typeof corpo !== "object") throw new Error("Perfil inválido.");

  await supabase.from("gabinete_perfil")
    .upsert({ id: 1, dados: corpo, atualizado_em: new Date().toISOString() })
    .throwOnError();

  return { ok: true };
}

async function catalogo(pedido: Request) {
  await autorizar(pedido);
  const { data } = await supabase.from("gabinete_catalogo").select("*").order("titulo");
  return { livros: data ?? [] };
}

async function livro(pedido: Request, url: URL) {
  await autorizar(pedido);
  const id = url.searchParams.get("id");
  if (!id) throw new Error("Informe o id do livro.");

  const { data } = await supabase.from("gabinete_livros").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Livro não encontrado.");
  return data;
}

async function gravarLivro(pedido: Request) {
  await autorizar(pedido);
  const { id, titulo, autor, ano, texto } = await pedido.json();
  if (!id || !titulo || !texto) throw new Error("Informe id, titulo e texto.");

  await supabase.from("gabinete_livros").upsert({
    id, titulo,
    autor: autor ?? "",
    ano: ano ?? null,
    palavras: String(texto).split(/\s+/).filter(Boolean).length,
    texto,
    atualizado_em: new Date().toISOString(),
  }).throwOnError();

  return { ok: true, id };
}

async function apagarLivro(pedido: Request, url: URL) {
  await autorizar(pedido);
  const id = url.searchParams.get("id");
  if (!id) throw new Error("Informe o id do livro.");
  await supabase.from("gabinete_livros").delete().eq("id", id).throwOnError();
  return { ok: true };
}

/**
 * Busca um artigo e devolve só o texto. Precisa rodar aqui porque o navegador bloqueia a leitura de
 * páginas de outros domínios — é o CORS, e não há como contorná-lo do lado do cliente.
 */
async function artigo(pedido: Request) {
  await autorizar(pedido);
  const { url } = await pedido.json();

  let endereco: URL;
  try {
    endereco = new URL(String(url));
  } catch {
    throw new Error("Endereço inválido.");
  }
  if (endereco.protocol !== "https:" && endereco.protocol !== "http:") {
    throw new Error("Use um endereço http:// ou https://.");
  }

  const resposta = await fetch(endereco, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Gabinete/1.0",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    },
    redirect: "follow",
  });
  if (!resposta.ok) throw new Error(`${endereco.hostname} respondeu com o erro ${resposta.status}.`);

  const html = await resposta.text();
  const extraido = extrair(html, endereco.hostname);
  if (extraido.palavras < 40) {
    throw new Error(
      "A página não trouxe texto suficiente. Ela pode exigir login ou montar o conteúdo por script; "
      + "nesse caso, salve o artigo em PDF e importe o arquivo.",
    );
  }

  return extraido;
}

// ---------------------------------------------------------------- extração de artigo

const BLOCOS_DE_RUIDO =
  /<(script|style|noscript|svg|canvas|iframe|form|nav|header|footer|aside|figure|figcaption|button|select|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

function extrair(html: string, anfitriao: string) {
  let limpo = html.replace(/<!--[\s\S]*?-->/g, " ");
  // Duas passadas: um menu dentro de outro menu só some depois que o de fora sai.
  limpo = limpo.replace(BLOCOS_DE_RUIDO, " ").replace(BLOCOS_DE_RUIDO, " ");

  const titulo = acharTitulo(html, anfitriao);
  const corpo = escolherBloco(limpo);
  const markdown = paraMarkdown(corpo);

  return { titulo, markdown, palavras: markdown.split(/\s+/).filter(Boolean).length };
}

function escolherBloco(html: string) {
  const marcados = [...html.matchAll(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)]
    .map((m) => m[2])
    .sort((a, b) => nota(b) - nota(a));
  if (marcados[0] && nota(marcados[0]) > 200) return marcados[0];

  const corpo = /<body[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)?.[1] ?? html;
  const melhor = [...corpo.matchAll(/<div\b[^>]*>([\s\S]*?)<\/div\s*>/gi)]
    .map((m) => m[1])
    .filter((c) => c.length > 400)
    .sort((a, b) => nota(b) - nota(a))[0];

  return melhor && nota(melhor) > nota(corpo) * 0.55 ? melhor : corpo;
}

/** Texto visível fora de links: menu e "leia também" são quase só link e caem para o fim da fila. */
function nota(html: string) {
  const semLinks = html.replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, " ");
  return (decodificar(semLinks.replace(/<[^>]{1,600}>/g, " ")).match(/\p{L}/gu) ?? []).length;
}

function acharTitulo(html: string, anfitriao: string) {
  const og = /<meta[^>]+property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([\s\S]*?)["']/i.exec(html);
  if (og) { const v = texto(og[1]); if (v) return v; }

  const tag = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (tag) {
    const v = texto(tag[1]);
    // "Título do artigo | Nome do site" vira só o título.
    const partes = v.split(/ \| | – | — | - /);
    if (partes.length > 1 && partes[0].trim().length >= 12) return partes[0].trim();
    if (v) return v;
  }

  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
  if (h1) { const v = texto(h1[1]); if (v) return v; }

  return anfitriao || "Artigo sem título";
}

function paraMarkdown(html: string) {
  let t = html.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, n, conteudo) =>
    `\n\n${"#".repeat(Number(n))} ${texto(conteudo)}\n\n`);
  t = t.replace(/<li[^>]*>([\s\S]*?)<\/li\s*>/gi, (_, c) => `\n- ${texto(c)}`);
  t = t.replace(/<(br|hr)\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|section|blockquote|ul|ol|tr|table|h[1-6])\s*>/gi, "\n\n");
  t = decodificar(t.replace(/<[^>]{1,600}>/g, " "));
  t = t.replace(/[^\S\n]+/g, " ");

  return t.split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function texto(valor: string) {
  return decodificar(valor.replace(/<[^>]{1,600}>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodificar(valor: string) {
  return valor
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// ---------------------------------------------------------------- apoio

async function autorizar(pedido: Request) {
  await conferir(pedido.headers.get(CABECALHO_SENHA) ?? "");
}

async function conferir(senha: string) {
  const { data } = await supabase.from("gabinete_config").select("senha_hash").eq("id", 1).maybeSingle();
  if (!data?.senha_hash) throw new Error("Ainda não existe senha. Faça o primeiro acesso.");
  if (!senha || (await hash(senha)) !== data.senha_hash) throw new Error("SENHA_INVALIDA");
}

async function hash(valor: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function montarCors(origem: string) {
  return {
    // Só as origens conhecidas: sem isso qualquer página poderia tentar senhas contra a função.
    "Access-Control-Allow-Origin": ORIGENS_PERMITIDAS.includes(origem) ? origem : ORIGENS_PERMITIDAS[0],
    "Access-Control-Allow-Headers": `authorization, content-type, apikey, ${CABECALHO_SENHA}`,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

function responder(corpo: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}
