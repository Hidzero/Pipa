-- Configuracoes da empresa - Parte 3
-- Rode depois de company-settings-02-storage.sql.

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
