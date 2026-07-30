-- Configuracoes da empresa - Parte 1
-- Rode primeiro no SQL Editor do Supabase.

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
