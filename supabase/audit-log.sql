-- Auditoria de alteracoes importantes
-- Execute este arquivo no SQL Editor do Supabase depois dos demais SQLs de estrutura.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete restrict,
  actor_id uuid references public.perfis(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null,
  changed_fields text[] not null default '{}',
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_check check (action in ('insert', 'update'))
);

alter table public.audit_logs enable row level security;

create index if not exists audit_logs_empresa_created_idx
on public.audit_logs (empresa_id, created_at desc);

create index if not exists audit_logs_table_record_idx
on public.audit_logs (table_name, record_id, created_at desc);

create index if not exists audit_logs_actor_idx
on public.audit_logs (actor_id, created_at desc);

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
);

grant select on public.audit_logs to authenticated;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_json jsonb;
  new_json jsonb;
  merged_json jsonb;
  changed text[];
  row_empresa_id uuid;
  row_record_id uuid;
begin
  if tg_op = 'INSERT' then
    old_json := null;
    new_json := to_jsonb(new);
    changed := array(
      select key
      from jsonb_object_keys(new_json - 'created_at' - 'updated_at') as fields(key)
      order by key
    );
  elsif tg_op = 'UPDATE' then
    old_json := to_jsonb(old);
    new_json := to_jsonb(new);
    merged_json := (old_json || new_json) - 'updated_at';

    changed := array(
      select key
      from jsonb_object_keys(merged_json) as fields(key)
      where (old_json -> key) is distinct from (new_json -> key)
      order by key
    );

    if coalesce(array_length(changed, 1), 0) = 0 then
      return new;
    end if;
  else
    return null;
  end if;

  row_empresa_id := coalesce(
    nullif(new_json ->> 'empresa_id', '')::uuid,
    nullif(old_json ->> 'empresa_id', '')::uuid
  );

  row_record_id := coalesce(
    nullif(new_json ->> 'id', '')::uuid,
    nullif(old_json ->> 'id', '')::uuid
  );

  insert into public.audit_logs (
    empresa_id,
    actor_id,
    table_name,
    record_id,
    action,
    changed_fields,
    old_data,
    new_data
  )
  values (
    row_empresa_id,
    auth.uid(),
    tg_table_name,
    row_record_id,
    lower(tg_op),
    coalesce(changed, '{}'),
    old_json,
    new_json
  );

  if tg_op = 'INSERT' then
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_log_trigger on public.perfis;
create trigger audit_log_trigger
after insert or update on public.perfis
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.clientes;
create trigger audit_log_trigger
after insert or update on public.clientes
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.locais_entrega;
create trigger audit_log_trigger
after insert or update on public.locais_entrega
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.caminhoes;
create trigger audit_log_trigger
after insert or update on public.caminhoes
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.pedidos;
create trigger audit_log_trigger
after insert or update on public.pedidos
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.agenda_entregas;
create trigger audit_log_trigger
after insert or update on public.agenda_entregas
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.entregas;
create trigger audit_log_trigger
after insert or update on public.entregas
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.reservatorios_entrega;
create trigger audit_log_trigger
after insert or update on public.reservatorios_entrega
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.pagamentos;
create trigger audit_log_trigger
after insert or update on public.pagamentos
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.recibos;
create trigger audit_log_trigger
after insert or update on public.recibos
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.combustiveis;
create trigger audit_log_trigger
after insert or update on public.combustiveis
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.despesas;
create trigger audit_log_trigger
after insert or update on public.despesas
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.caminhao_motoristas;
create trigger audit_log_trigger
after insert or update on public.caminhao_motoristas
for each row execute function public.audit_row_change();

drop trigger if exists audit_log_trigger on public.supervisor_funcionarios;
create trigger audit_log_trigger
after insert or update on public.supervisor_funcionarios
for each row execute function public.audit_row_change();
