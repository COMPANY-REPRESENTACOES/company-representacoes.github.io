-- Company Vendas · todo pedido novo (programa de vendas ou Pedido Express) entra como Em Aprovação
create or replace function public.pedido_status_inicial() returns trigger language plpgsql as $f$
begin
  if new.status is null or new.status = 'recebido' then new.status := 'espelho_enviado'; end if;
  return new;
end $f$;
drop trigger if exists pedido_status_inicial on public.pedidos;
create trigger pedido_status_inicial before insert on public.pedidos for each row execute function public.pedido_status_inicial();
alter table public.pedidos alter column status set default 'espelho_enviado';
