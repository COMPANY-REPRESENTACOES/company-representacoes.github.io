-- Company Vendas · "Lembrar em 2 dias" dos pedidos Em Aprovação (vale em todos os aparelhos)
create table if not exists public.aprov_alertas (
  pedido_id text primary key,
  ate timestamptz not null,
  usuario text,
  atualizado_em timestamptz not null default now()
);
alter table public.aprov_alertas enable row level security;
drop policy if exists "aprov todos" on public.aprov_alertas;
create policy "aprov todos" on public.aprov_alertas for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.aprov_alertas to authenticated;
