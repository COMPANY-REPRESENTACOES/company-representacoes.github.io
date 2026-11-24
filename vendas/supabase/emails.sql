-- Company Vendas · registro dos e-mails enviados pelo programa (com confirmação de leitura)
create table if not exists public.emails_enviados (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  pedido_id text,
  pedido_numero text,
  grupo text,
  destinatario text not null,
  assunto text,
  enviado_em timestamptz not null default now(),
  enviado_por text,
  vendedor_codigo text,
  status_envio text default 'enviando',
  erro text,
  lido boolean not null default false,
  lido_em timestamptz,
  aberturas int not null default 0,
  conferido boolean not null default false
);
create index if not exists emails_enviados_enviado_em on public.emails_enviados (enviado_em desc);
alter table public.emails_enviados enable row level security;
drop policy if exists "emails ler" on public.emails_enviados;
create policy "emails ler" on public.emails_enviados for select to authenticated using (true);
drop policy if exists "emails conferir" on public.emails_enviados;
create policy "emails conferir" on public.emails_enviados for update to authenticated using (true) with check (true);
-- a gravação dos envios e da leitura é feita pelas funções enviar-email e abriu (chave de serviço)
-- permissões da tabela (o banco não libera tabelas novas sozinho)
grant select, insert, update on table public.emails_enviados to service_role;
grant select, update on table public.emails_enviados to authenticated;
-- 24/11/2026: acessos automáticos na entrega (menos de 2 min do envio) não contam como leitura
alter table public.emails_enviados add column if not exists pre_aberturas int not null default 0;
alter table public.emails_enviados add column if not exists ultimo_acesso text;
