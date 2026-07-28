-- Historico de vinculo motorista x caminhao
-- Execute este arquivo no SQL Editor do Supabase.

create table if not exists public.caminhao_motoristas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  caminhao_id uuid not null references public.caminhoes(id) on delete restrict,
  motorista_id uuid not null references public.perfis(id) on delete restrict,
  data_inicio date not null default current_date,
  data_fim date,
  tipo text not null default 'principal',
  observacoes text,
  ativo boolean not null default true,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caminhao_motoristas_periodo_check check (data_fim is null or data_fim >= data_inicio),
  constraint caminhao_motoristas_tipo_check check (tipo in ('principal', 'substituto', 'temporario'))
);

alter table public.caminhao_motoristas enable row level security;

create index if not exists caminhao_motoristas_empresa_caminhao_idx
on public.caminhao_motoristas (empresa_id, caminhao_id, data_inicio desc);

create index if not exists caminhao_motoristas_empresa_motorista_idx
on public.caminhao_motoristas (empresa_id, motorista_id, data_inicio desc);

create index if not exists caminhao_motoristas_ativos_idx
on public.caminhao_motoristas (empresa_id, ativo)
where ativo = true;

drop trigger if exists set_updated_at on public.caminhao_motoristas;
create trigger set_updated_at
before update on public.caminhao_motoristas
for each row execute function public.set_updated_at();

drop policy if exists caminhao_motoristas_select_roles on public.caminhao_motoristas;
create policy caminhao_motoristas_select_roles
on public.caminhao_motoristas
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
);

drop policy if exists caminhao_motoristas_insert_admin on public.caminhao_motoristas;
create policy caminhao_motoristas_insert_admin
on public.caminhao_motoristas
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador']::public.user_role[])
);

drop policy if exists caminhao_motoristas_update_admin on public.caminhao_motoristas;
create policy caminhao_motoristas_update_admin
on public.caminhao_motoristas
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador']::public.user_role[])
);

grant select, insert, update on public.caminhao_motoristas to authenticated;
