-- Pipa Entregas - buckets e politicas de arquivos
-- Execute depois de schema.sql e policies.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('fotos-locais', 'fotos-locais', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('fotos-entregas', 'fotos-entregas', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('comprovantes', 'comprovantes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('assinaturas', 'assinaturas', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('recibos', 'recibos', false, 10485760, array['application/pdf'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pipa_storage_select_same_company" on storage.objects;
create policy "pipa_storage_select_same_company"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('fotos-locais', 'fotos-entregas', 'comprovantes', 'assinaturas', 'recibos')
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);

drop policy if exists "pipa_storage_insert_same_company" on storage.objects;
create policy "pipa_storage_insert_same_company"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('fotos-locais', 'fotos-entregas', 'comprovantes', 'assinaturas', 'recibos')
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);

drop policy if exists "pipa_storage_update_same_company" on storage.objects;
create policy "pipa_storage_update_same_company"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('fotos-locais', 'fotos-entregas', 'comprovantes', 'assinaturas', 'recibos')
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
)
with check (
  bucket_id in ('fotos-locais', 'fotos-entregas', 'comprovantes', 'assinaturas', 'recibos')
  and (storage.foldername(name))[1] = public.current_user_empresa_id()::text
);
