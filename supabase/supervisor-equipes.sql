-- Historico de supervisor responsavel por funcionario
-- Execute este arquivo no SQL Editor do Supabase depois de user-access-levels.sql.

create table if not exists public.supervisor_funcionarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  supervisor_id uuid not null references public.perfis(id) on delete restrict,
  funcionario_id uuid not null references public.perfis(id) on delete restrict,
  data_inicio date not null default current_date,
  data_fim date,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supervisor_funcionarios_periodo_check check (data_fim is null or data_fim >= data_inicio),
  constraint supervisor_funcionarios_distintos_check check (supervisor_id <> funcionario_id)
);

alter table public.supervisor_funcionarios enable row level security;

create unique index if not exists supervisor_funcionarios_ativo_unique_idx
on public.supervisor_funcionarios (empresa_id, funcionario_id)
where ativo = true;

create index if not exists supervisor_funcionarios_empresa_supervisor_idx
on public.supervisor_funcionarios (empresa_id, supervisor_id, ativo);

create index if not exists supervisor_funcionarios_empresa_funcionario_idx
on public.supervisor_funcionarios (empresa_id, funcionario_id, data_inicio desc);

drop trigger if exists set_updated_at on public.supervisor_funcionarios;
create trigger set_updated_at
before update on public.supervisor_funcionarios
for each row execute function public.set_updated_at();

drop policy if exists supervisor_funcionarios_select on public.supervisor_funcionarios;
create policy supervisor_funcionarios_select
on public.supervisor_funcionarios
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_access(array['administrador']::public.nivel_acesso[])
    or supervisor_id = auth.uid()
    or funcionario_id = auth.uid()
  )
);

drop policy if exists supervisor_funcionarios_insert_admin on public.supervisor_funcionarios;
create policy supervisor_funcionarios_insert_admin
on public.supervisor_funcionarios
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
);

drop policy if exists supervisor_funcionarios_update_admin on public.supervisor_funcionarios;
create policy supervisor_funcionarios_update_admin
on public.supervisor_funcionarios
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

grant select, insert, update on public.supervisor_funcionarios to authenticated;

drop policy if exists perfis_select_same_company on public.perfis;
create policy perfis_select_same_company
on public.perfis
for select
to authenticated
using (
  id = auth.uid()
  or (
    empresa_id = public.current_user_empresa_id()
    and public.has_access(array['administrador']::public.nivel_acesso[])
  )
  or (
    empresa_id = public.current_user_empresa_id()
    and exists (
      select 1
      from public.supervisor_funcionarios sf
      where sf.supervisor_id = auth.uid()
        and sf.funcionario_id = perfis.id
        and sf.ativo = true
    )
  )
);
