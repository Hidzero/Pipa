-- Configuracoes da empresa
-- Execute este arquivo no SQL Editor do Supabase depois de user-access-levels.sql e storage.sql.
-- Se aparecer deadlock no SQL Editor, rode os arquivos menores nesta ordem:
-- 1. company-settings-01-empresa.sql
-- 2. company-settings-02-storage.sql
-- 3. company-settings-03-politicas-mensagens.sql

alter table public.empresas
add column if not exists nome_fantasia text,
add column if not exists whatsapp_principal text,
add column if not exists logo_path text,
add column if not exists texto_recibo text,
add column if not exists observacoes_operacionais text;

update public.empresas
set
  nome_fantasia = coalesce(nome_fantasia, nome),
  texto_recibo = coalesce(texto_recibo, 'Obrigado pela preferencia.'),
  whatsapp_principal = coalesce(whatsapp_principal, telefone)
where nome_fantasia is null
   or texto_recibo is null
   or whatsapp_principal is null;

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

drop policy if exists empresas_update_admin on public.empresas;
create policy empresas_update_admin
on public.empresas
for update
to authenticated
using (
  id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
)
with check (
  id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
);

drop policy if exists mensagens_write_admin_atendente on public.mensagens_modelo;
drop policy if exists mensagens_update_admin_atendente on public.mensagens_modelo;
drop policy if exists mensagens_write_admin on public.mensagens_modelo;
drop policy if exists mensagens_update_admin on public.mensagens_modelo;

create policy mensagens_write_admin
on public.mensagens_modelo
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_access(array['administrador']::public.nivel_acesso[])
);

create policy mensagens_update_admin
on public.mensagens_modelo
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

insert into public.mensagens_modelo (empresa_id, tipo, titulo, texto)
select e.id, template.tipo, template.titulo, template.texto
from public.empresas e
cross join (
  values
    ('confirmacao', 'Confirmacao de pedido', 'Ola, {cliente}. Seu pedido de {quantidade} litros foi confirmado para {data}.'),
    ('saida_entrega', 'Saida para entrega', 'Ola, {cliente}. Nosso caminhao saiu para sua entrega de agua.'),
    ('recibo', 'Envio de recibo', 'Ola, {cliente}. Segue o recibo da entrega numero {numero_entrega}.'),
    ('cobranca', 'Cobranca', 'Ola, {cliente}. Identificamos um valor pendente de {valor}. Podemos ajudar com o pagamento?')
) as template(tipo, titulo, texto)
on conflict (empresa_id, tipo) do nothing;
