-- Permissoes detalhadas por acao
-- Execute este arquivo no SQL Editor do Supabase depois de user-access-levels.sql.

create or replace function public.protect_pedido_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_nivel_acesso() = 'supervisor'::public.nivel_acesso then
    if tg_op = 'INSERT' then
      new.valor_total := 0;
      new.forma_pagamento := null;
      if new.status in ('cancelado'::public.pedido_status, 'concluido'::public.pedido_status) then
        raise exception 'Supervisor nao pode criar pedido com status %.', new.status;
      end if;
    elsif tg_op = 'UPDATE' then
      new.valor_total := old.valor_total;
      new.forma_pagamento := old.forma_pagamento;

      if old.status is distinct from 'cancelado'::public.pedido_status
        and new.status = 'cancelado'::public.pedido_status then
        raise exception 'Apenas administrador pode cancelar pedidos.';
      end if;

      if old.status is distinct from 'concluido'::public.pedido_status
        and new.status = 'concluido'::public.pedido_status then
        raise exception 'Pedido concluido deve vir do registro de entrega.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_pedido_financial_fields on public.pedidos;
create trigger protect_pedido_financial_fields
before insert or update on public.pedidos
for each row execute function public.protect_pedido_financial_fields();

create or replace function public.protect_customer_active_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_nivel_acesso() = 'supervisor'::public.nivel_acesso
    and old.ativo is distinct from new.ativo then
    raise exception 'Apenas administrador pode inativar ou reativar clientes e locais.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_clientes_active_status on public.clientes;
create trigger protect_clientes_active_status
before update on public.clientes
for each row execute function public.protect_customer_active_status();

drop trigger if exists protect_locais_active_status on public.locais_entrega;
create trigger protect_locais_active_status
before update on public.locais_entrega
for each row execute function public.protect_customer_active_status();
