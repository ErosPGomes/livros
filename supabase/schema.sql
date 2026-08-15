-- Esquema do Gabinete no Supabase.
--
-- É um app de uma pessoa só, então cada tabela de estado tem no máximo uma linha e a chave é fixa
-- em 1. Isso troca "qual é o meu registro?" por "o registro", e mata a classe inteira de bugs de
-- linha duplicada.
--
-- Segurança: RLS ligado e nenhuma policy. Sem policy, nem a chave anônima nem um usuário logado
-- enxergam nada — só a service role, que existe apenas dentro da Edge Function e nunca chega ao
-- navegador. É o mesmo desenho do Radar de Clientes.

create table if not exists gabinete_config (
  id smallint primary key default 1,
  senha_hash text,
  criado_em timestamptz not null default now(),
  constraint gabinete_config_linha_unica check (id = 1)
);

create table if not exists gabinete_perfil (
  id smallint primary key default 1,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  constraint gabinete_perfil_linha_unica check (id = 1)
);

-- Os livros com direitos moram aqui, não no repositório: repositório público é publicação.
create table if not exists gabinete_livros (
  id text primary key,
  titulo text not null,
  autor text not null default '',
  ano integer,
  palavras integer not null default 0,
  texto text not null,
  atualizado_em timestamptz not null default now()
);

alter table gabinete_config enable row level security;
alter table gabinete_perfil enable row level security;
alter table gabinete_livros enable row level security;

-- A lista da estante não precisa carregar o livro inteiro; sem esta view, abrir a estante baixaria
-- todos os textos de uma vez.
create or replace view gabinete_catalogo as
  select id, titulo, autor, ano, palavras, atualizado_em
  from gabinete_livros;

insert into gabinete_config (id) values (1) on conflict (id) do nothing;
insert into gabinete_perfil (id) values (1) on conflict (id) do nothing;
