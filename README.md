# Gabinete

Leitor dinâmico para celular: uma palavra por vez em ponto fixo, com plano de treino, teste de
retenção e ofensiva diária. Roda no navegador, instala como aplicativo e funciona sem internet.

Destino: **https://livros.erosgomes.com.br**

## Como rodar

```bash
npm run dev
```

Abre em `http://localhost:4173`. Não há dependências para instalar — só Node.

## Como funciona

Sem framework, sem build, sem pacote externo. O app é HTML, CSS e módulos ES servidos direto.

```text
web/            fonte do app
  index.html
  estilo.css
  js/
    texto.js    limpeza do Markdown, ritmo por palavra, ponto de foco, capítulos
    leitor.js   motor da leitura: tempo de cada palavra, push mode, trava de tela
    quiz.js     teste de compreensão por lacuna, gerado do trecho lido
    treino.js   plano de 14 dias, ofensiva, conquistas, velocidade sugerida
    dados.js    perfil no aparelho e carregamento dos livros
    som.js      som de fundo sintetizado, sem arquivos
    app.js      telas e interface — o único que toca no DOM
  livros/       os livros publicados + index.json
docs/           cópia servida pelo GitHub Pages (gerada, não editar)
scripts/        servidor de desenvolvimento, publicação, conversores
```

### O ritmo não é constante

Cada palavra recebe um multiplicador sobre o tempo base: vírgula pede mais tempo que palavra solta,
ponto final pede mais que vírgula, palavra longa e número pedem mais que palavra curta e comum. Sem
isso o RSVP vira metralhadora e a pontuação some.

A média desses multiplicadores é descontada na hora de calcular a duração, então **a velocidade
escolhida é a velocidade real**: 600 ppm entrega 600 palavras por minuto, não 500.

### O freio de compreensão

Ao encerrar uma sessão, o app monta um teste de lacuna com as frases do trecho que acabou de ser
lido — sem IA, sem enviar nada para fora. A retenção medida realimenta a velocidade sugerida da
próxima sessão: abaixo de 70% ela recua, acima de 90% ela sobe. Velocidade sem retenção não conta.

## Como adicionar livros

Os livros são arquivos Markdown em `web/livros/`, com os capítulos em `##`:

```markdown
# Título do livro

_Autor_

## I. Primeiro capítulo

Texto do capítulo...
```

1. Converta o PDF, EPUB ou DOCX para `.md` (o EasyTasks faz isso pela rotina "Documentos para
   Markdown"). **Prefira EPUB a PDF sempre que existir**: EPUB tem capítulos de verdade, sem
   cabeçalho, rodapé, número de página nem hifenização de layout para desfazer.
2. Coloque o arquivo em `web/livros/`.
3. Acrescente a entrada em `web/livros/index.json`.
4. `npm run publicar` e `git push`.

O leitor pula sozinho a folha de rosto: ele começa no primeiro capítulo `##`, desde que a mobília
antes dele seja pequena perto do livro. Nada é apagado — só o ponto de partida muda.

Para textos do Project Gutenberg existe um conversor pronto:

```bash
node scripts/gutenberg-para-md.mjs entrada.txt web/livros/saida.md "Título" "Autor"
```

## Publicar

```bash
npm run publicar
```

Copia `web/` para `docs/`, grava o `CNAME` do domínio e o `.nojekyll`. Depois é `git push`.

No GitHub, em **Settings → Pages → Build and deployment**, a origem precisa ser
`Deploy from a branch`, branch `main`, **pasta `/docs`** — e não `/ (root)`. Com a raiz selecionada,
o Pages publica o README como se fosse o site e o app fica escondido em `/docs/`.

No DNS, `livros` precisa de um `CNAME` para `erospgomes.github.io`. O certificado HTTPS sai sozinho
depois que o DNS propaga — e o HTTPS é obrigatório, porque sem ele o app não instala como PWA.

## Atalhos

| No celular | No computador |
|---|---|
| tocar na tela: inicia e pausa | espaço: inicia e pausa |
| arrastar para a direita: volta uma frase | ←: volta uma frase |
| arrastar para a esquerda: pula o trecho | →: pula o trecho |
| arrastar para cima e baixo: velocidade | ↑ ↓: velocidade |

## Área logada e nuvem

O código está pronto em `supabase/`, mas **ainda não foi publicado**. Enquanto não for, o app roda
inteiro sem nuvem: livros públicos e progresso local.

A Edge Function existe por dois motivos que o Pages não resolve: guardar o progresso fora do
aparelho (celular e computador veem a mesma coisa) e servir o texto de livros que não podem ser
publicados. Autenticação por senha, comparada pelo hash SHA-256 — a senha nunca é gravada.

### Publicar o backend

1. Rodar `supabase/schema.sql` no projeto (SQL Editor ou Management API).
2. Publicar `supabase/functions/gabinete/` com o slug `gabinete` e **`verify_jwt` desligado** — a
   autenticação é a senha, não o JWT do Supabase.
3. Conferir se a origem do site está em `ORIGENS_PERMITIDAS`, dentro da função.
4. Abrir o app, ir em Progresso › Sincronização › Entrar e criar a senha no primeiro acesso.

O projeto é o **próprio do usuário** (`agsfaaertvwyrlqeywzn`). O projeto da agência Reach nunca deve
ser usado.

### Livro com direitos

Ele não entra no Git. `npm run publicar` só copia para `docs/` o que estiver marcado com
`"dominioPublico": true`; o resto é enviado para a nuvem:

```bash
set GABINETE_SENHA=sua-senha
node scripts/enviar-livro.mjs caminho/livro.md "Título" "Autor" 1899
```

O livro passa a aparecer na estante de quem entrar com a senha, e em nenhum outro lugar.

### Sincronização

Não é "o mais recente vence". Histórico de sessões e biblioteca são **somados** entre aparelhos, e
a posição de cada livro fica sendo a mais avançada das duas. Só o que é escolha única — metas,
ajustes, plano — segue quem foi mexido por último. Sem isso, ler no celular apagaria o que foi lido
no computador enquanto ele estava fechado.

## O que ainda não existe

- Publicação do backend (o código está pronto, falta o deploy) e o repositório no GitHub.
- Notificação diária de lembrete.
- Importar artigo por URL já está implementado na função, mas ainda não tem botão na interface.

## Licença dos textos

`web/livros/dom-casmurro.md` vem do Project Gutenberg e está em domínio público. Livros com direitos
não devem entrar em repositório público — para eles, use `enviar-livro.mjs`.
