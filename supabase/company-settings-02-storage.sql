-- Configuracoes da empresa - Parte 2
-- Rode depois de company-settings-01-empresa.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos-empresas', 'logos-empresas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pipa_storage_select_company_logos" on storage.objects;
create policy "pipa_storage_select_company_logos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'logos-empresas'
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);

drop policy if exists "pipa_storage_insert_company_logos_admin" on storage.objects;
create policy "pipa_storage_insert_company_logos_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'logos-empresas'
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
  and public.has_access(array['administrador']::public.nivel_acesso[])
);

drop policy if exists "pipa_storage_update_company_logos_admin" on storage.objects;
create policy "pipa_storage_update_company_logos_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'logos-empresas'
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
  and public.has_access(array['administrador']::public.nivel_acesso[])
)
with check (
  bucket_id = 'logos-empresas'
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
  and public.has_access(array['administrador']::public.nivel_acesso[])
);
