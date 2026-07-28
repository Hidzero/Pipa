-- Area de funcionarios
-- Execute este arquivo no SQL Editor do Supabase depois de user-access-levels.sql.

alter table public.perfis
add column if not exists email text;

update public.perfis p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null;

create unique index if not exists perfis_email_unique_idx
on public.perfis (lower(email))
where email is not null;

create index if not exists perfis_empresa_nivel_acesso_idx
on public.perfis (empresa_id, nivel_acesso, ativo);

create index if not exists perfis_empresa_funcao_idx
on public.perfis (empresa_id, funcao, ativo);
