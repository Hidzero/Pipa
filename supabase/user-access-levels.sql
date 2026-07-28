-- Niveis de acesso por empresa
-- Execute este arquivo no SQL Editor do Supabase antes de testar os novos perfis.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'nivel_acesso') then
    create type public.nivel_acesso as enum ('administrador', 'supervisor', 'funcionario');
  end if;
end $$;

alter table public.perfis
add column if not exists nivel_acesso public.nivel_acesso not null default 'funcionario';

alter table public.perfis
add column if not exists cargo text;

update public.perfis
set
  nivel_acesso = case
    when funcao = 'administrador' then 'administrador'::public.nivel_acesso
    else nivel_acesso
  end,
  cargo = coalesce(cargo, case
    when funcao = 'administrador' then 'Administrador da empresa'
    when funcao = 'atendente' then 'Atendente'
    when funcao = 'motorista' then 'Motorista'
    when funcao = 'financeiro' then 'Financeiro'
    else 'Funcionario'
  end);

create or replace function public.current_user_nivel_acesso()
returns public.nivel_acesso
language sql
security definer
set search_path = public
stable
as $$
  select p.nivel_acesso
  from public.perfis p
  where p.id = auth.uid()
    and p.ativo = true
  limit 1
$$;

create or replace function public.has_access(allowed_levels public.nivel_acesso[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_nivel_acesso() = any(allowed_levels), false)
$$;

create or replace function public.has_role(allowed_roles public.user_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select
      case
        when p.nivel_acesso = 'administrador' then true
        when p.nivel_acesso = 'supervisor' then false
        else p.funcao = any(allowed_roles)
      end
    from public.perfis p
    where p.id = auth.uid()
      and p.ativo = true
    limit 1
  ), false)
$$;

drop policy if exists perfis_select_same_company on public.perfis;
create policy perfis_select_same_company
on public.perfis
for select
to authenticated
using (
  id = auth.uid()
  or (
    empresa_id = public.current_user_empresa_id()
    and public.has_access(array['administrador', 'supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists perfis_insert_admin on public.perfis;
create policy perfis_insert_admin
on public.perfis
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
);

drop policy if exists clientes_select_roles on public.clientes;
create policy clientes_select_roles
on public.clientes
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists clientes_insert_admin_atendente on public.clientes;
create policy clientes_insert_admin_atendente
on public.clientes
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists clientes_update_admin_atendente on public.clientes;
create policy clientes_update_admin_atendente
on public.clientes
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
)
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists locais_select_roles on public.locais_entrega;
create policy locais_select_roles
on public.locais_entrega
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists locais_insert_admin_atendente on public.locais_entrega;
create policy locais_insert_admin_atendente
on public.locais_entrega
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists locais_update_admin_atendente on public.locais_entrega;
create policy locais_update_admin_atendente
on public.locais_entrega
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
)
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists caminhoes_select_roles on public.caminhoes;
create policy caminhoes_select_roles
on public.caminhoes
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists pedidos_select_roles on public.pedidos;
create policy pedidos_select_roles
on public.pedidos
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
    or exists (
      select 1
      from public.agenda_entregas a
      where a.pedido_id = pedidos.id
        and a.motorista_id = auth.uid()
    )
  )
);

drop policy if exists pedidos_insert_admin_atendente on public.pedidos;
create policy pedidos_insert_admin_atendente
on public.pedidos
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists pedidos_update_admin_atendente_motorista on public.pedidos;
create policy pedidos_update_admin_atendente_motorista
on public.pedidos
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
    or exists (
      select 1
      from public.agenda_entregas a
      where a.pedido_id = pedidos.id
        and a.motorista_id = auth.uid()
    )
  )
)
with check (empresa_id = public.current_user_empresa_id());

drop policy if exists agenda_select_roles on public.agenda_entregas;
create policy agenda_select_roles
on public.agenda_entregas
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists agenda_insert_admin_atendente on public.agenda_entregas;
create policy agenda_insert_admin_atendente
on public.agenda_entregas
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists agenda_update_admin_atendente on public.agenda_entregas;
create policy agenda_update_admin_atendente
on public.agenda_entregas
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
)
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists entregas_select_roles on public.entregas;
create policy entregas_select_roles
on public.entregas
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists entregas_insert_admin_atendente_motorista on public.entregas;
create policy entregas_insert_admin_atendente_motorista
on public.entregas
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists entregas_update_admin_atendente_motorista on public.entregas;
create policy entregas_update_admin_atendente_motorista
on public.entregas
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
    or motorista_id = auth.uid()
  )
)
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists reservatorios_select_roles on public.reservatorios_entrega;
create policy reservatorios_select_roles
on public.reservatorios_entrega
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists reservatorios_insert_roles on public.reservatorios_entrega;
drop policy if exists reservatorios_insert_admin_atendente_motorista on public.reservatorios_entrega;
create policy reservatorios_insert_admin_atendente_motorista
on public.reservatorios_entrega
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'motorista']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists reservatorios_update_roles on public.reservatorios_entrega;
drop policy if exists reservatorios_update_admin_atendente_motorista on public.reservatorios_entrega;
create policy reservatorios_update_admin_atendente_motorista
on public.reservatorios_entrega
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'motorista']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
)
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'motorista']::public.user_role[])
    or public.has_access(array['supervisor']::public.nivel_acesso[])
  )
);

drop policy if exists perfis_update_admin on public.perfis;
create policy perfis_update_admin
on public.perfis
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
);
