-- Pipa Entregas - reset de desenvolvimento
-- Use somente se ainda nao houver dados reais no banco.
-- Este script remove as tabelas, funcoes e enums deste app para permitir recriar o schema limpo.

drop table if exists public.sync_logs cascade;
drop table if exists public.status_historico cascade;
drop table if exists public.arquivos cascade;
drop table if exists public.mensagens_modelo cascade;
drop table if exists public.despesas cascade;
drop table if exists public.combustiveis cascade;
drop table if exists public.recibos cascade;
drop table if exists public.pagamentos cascade;
drop table if exists public.reservatorios_entrega cascade;
drop table if exists public.entregas cascade;
drop table if exists public.agenda_entregas cascade;
drop table if exists public.pedidos cascade;
drop table if exists public.caminhoes cascade;
drop table if exists public.locais_entrega cascade;
drop table if exists public.clientes cascade;
drop table if exists public.perfis cascade;
drop table if exists public.empresas cascade;

drop function if exists public.set_updated_at() cascade;
drop function if exists public.current_user_empresa_id() cascade;
drop function if exists public.current_user_funcao() cascade;
drop function if exists public.has_role(public.user_role[]) cascade;
drop function if exists public.is_same_empresa(uuid) cascade;

drop type if exists public.recibo_status cascade;
drop type if exists public.registro_status cascade;
drop type if exists public.pagamento_status cascade;
drop type if exists public.forma_pagamento cascade;
drop type if exists public.prioridade_pedido cascade;
drop type if exists public.pedido_status cascade;
drop type if exists public.status_caminhao cascade;
drop type if exists public.tipo_cliente cascade;
drop type if exists public.user_role cascade;
