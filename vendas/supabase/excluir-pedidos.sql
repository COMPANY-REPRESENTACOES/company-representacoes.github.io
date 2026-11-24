-- Company Vendas · permissão para excluir pedidos (botão 🗑 Excluir na lista de pedidos)
grant delete on table public.pedidos to authenticated;
drop policy if exists "pedidos excluir" on public.pedidos;
create policy "pedidos excluir" on public.pedidos for delete to authenticated using (true);

do $$ begin
  if to_regclass('public.pedido_historico') is not null then
    execute 'grant delete on table public.pedido_historico to authenticated';
    execute 'drop policy if exists "historico excluir" on public.pedido_historico';
    execute 'create policy "historico excluir" on public.pedido_historico for delete to authenticated using (true)';
  end if;
end $$;
