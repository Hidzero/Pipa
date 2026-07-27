-- Empresa ficticia para demonstracao
-- Execute no SQL Editor depois de rodar schema.sql, policies.sql e storage.sql.
-- Este script nao cria usuario. Para login, crie o usuario no Auth e vincule em perfis.

with empresa_existente as (
  select id
  from public.empresas
  where documento = '12.987.654/0001-20'
  limit 1
),
nova_empresa as (
  insert into public.empresas (
    nome,
    documento,
    telefone,
    email,
    endereco,
    ativo
  )
  select
    'Agua Clara Caminhao-Pipa Ltda',
    '12.987.654/0001-20',
    '(11) 3888-2400',
    'contato@aguaclarapipa.example.com',
    'Avenida dos Reservatorios, 740 - Vila Mariana, Sao Paulo - SP',
    true
  where not exists (select 1 from empresa_existente)
  returning id
),
empresa_alvo as (
  select id from nova_empresa
  union all
  select id from empresa_existente
  limit 1
)
insert into public.mensagens_modelo (empresa_id, tipo, titulo, texto)
select empresa_alvo.id, tipo, titulo, texto
from empresa_alvo
cross join (
  values
    ('confirmacao', 'Confirmacao de pedido', 'Ola, {cliente}. Seu pedido de {quantidade} litros foi confirmado para {data}.'),
    ('saida_entrega', 'Saida para entrega', 'Ola, {cliente}. O caminhao saiu para sua entrega.'),
    ('recibo', 'Envio de recibo', 'Ola, {cliente}. Segue o recibo da entrega numero {numero_entrega}.'),
    ('cobranca', 'Cobranca', 'Ola, {cliente}. Identificamos um valor pendente de {valor_pendente}. Podemos combinar o pagamento?')
) as m(tipo, titulo, texto)
on conflict (empresa_id, tipo) do nothing;

select
  id,
  nome,
  documento,
  telefone,
  email
from public.empresas
where documento = '12.987.654/0001-20';
