-- Company Vendas · status aceitos nos pedidos (inclui Não Aprovado Pendência = nao_aprovado e Pedido em Carteira = em_carteira)
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos add constraint pedidos_status_check check (status in ('recebido','em_revisao','aprovado','espelho_enviado','nao_aprovado','enviado_fabrica','em_carteira','faturado','cancelado')) not valid;
