-- Exemplo para criar a primeira empresa e vincular o primeiro usuario admin.
-- 1. Crie o usuario em Authentication > Users no painel do Supabase.
-- 2. Copie o UUID desse usuario.
-- 3. Substitua os valores abaixo e execute este arquivo no SQL Editor.

with nova_empresa as (
  insert into public.empresas (nome, telefone, email)
  values ('Minha Empresa de Caminhao-Pipa', '(00) 00000-0000', 'contato@empresa.com')
  returning id
)
insert into public.perfis (id, empresa_id, nome, funcao, telefone)
select
  'COLE_AQUI_O_UUID_DO_USUARIO_AUTH'::uuid,
  nova_empresa.id,
  'Administrador',
  'administrador',
  '(00) 00000-0000'
from nova_empresa;

-- Mensagens prontas iniciais, opcionais:
insert into public.mensagens_modelo (empresa_id, tipo, titulo, texto)
select empresa_id, tipo, titulo, texto
from public.perfis p
cross join (
  values
    ('confirmacao', 'Confirmacao de pedido', 'Ola, {cliente}. Seu pedido de {quantidade} litros foi confirmado para {data}.'),
    ('saida_entrega', 'Saida para entrega', 'Ola, {cliente}. O caminhao saiu para sua entrega. Acompanhe pelo endereco combinado.'),
    ('recibo', 'Envio de recibo', 'Ola, {cliente}. Segue o recibo da entrega numero {numero_entrega}.'),
    ('cobranca', 'Cobranca', 'Ola, {cliente}. Identificamos um valor pendente de {valor_pendente}. Podemos combinar o pagamento?')
) as m(tipo, titulo, texto)
where p.id = 'COLE_AQUI_O_UUID_DO_USUARIO_AUTH'::uuid
on conflict (empresa_id, tipo) do nothing;
