-- Company Vendas · permissão para excluir clientes (botão 🗑 Excluir na lista de clientes)
grant delete on table public.clientes to authenticated;
drop policy if exists "clientes excluir" on public.clientes;
create policy "clientes excluir" on public.clientes for delete to authenticated using (true);
