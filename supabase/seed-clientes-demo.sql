-- Clientes ficticios para demonstracao
-- Execute no SQL Editor depois de criar a primeira empresa/perfil admin.
-- O script usa a primeira empresa encontrada em public.empresas.

do $$
begin
  if not exists (select 1 from public.empresas) then
    raise exception 'Crie uma empresa antes de rodar este seed.';
  end if;
end $$;

with empresa_alvo as (
  select id
  from public.empresas
  order by created_at
  limit 1
),
dados_clientes (
  cliente_id,
  nome,
  telefone,
  email,
  cpf_cnpj,
  endereco,
  ponto_referencia,
  latitude,
  longitude,
  tipo,
  observacoes,
  local_nome,
  local_endereco,
  local_latitude,
  local_longitude,
  local_ponto_referencia,
  informacoes_acesso,
  quantidade_reservatorios,
  capacidade_total_litros,
  distancia_mangueira_metros,
  local_observacoes
) as (
  values
    (gen_random_uuid(), 'Ana Paula Martins', '(11) 98821-3401', 'ana.martins@example.com', '123.456.789-09', 'Rua das Palmeiras, 120 - Jardim Europa, Sao Paulo - SP', 'Proximo a farmacia Popular', -23.5792100, -46.6732200, 'pessoa_fisica'::public.tipo_cliente, 'Cliente prefere entrega no periodo da manha.', 'Casa principal', 'Rua das Palmeiras, 120 - Jardim Europa, Sao Paulo - SP', -23.5792100, -46.6732200, 'Portao branco ao lado da farmacia', 'Interfone 12. Aguardar abertura do portao social.', 2, 4000, 25, 'Reservatorios no fundo do corredor lateral.'),
    (gen_random_uuid(), 'Condominio Vale Azul', '(11) 4002-1188', 'sindico.valeazul@example.com', '12.345.678/0001-90', 'Avenida Agua Branca, 880 - Barra Funda, Sao Paulo - SP', 'Em frente ao mercado Central', -23.5254100, -46.6729100, 'condominio'::public.tipo_cliente, 'Solicitar autorizacao na portaria antes de entrar.', 'Portaria 1', 'Avenida Agua Branca, 880 - Barra Funda, Sao Paulo - SP', -23.5254100, -46.6729100, 'Guarita com cancela azul', 'Entrada pela portaria de servico. Documento do motorista obrigatorio.', 4, 20000, 40, 'Casa de bombas no subsolo B1.'),
    (gen_random_uuid(), 'Mercado Sol Nascente Ltda', '(11) 3567-2210', 'compras@solnascente.example.com', '23.456.789/0001-12', 'Rua Padre Joao, 430 - Penha, Sao Paulo - SP', 'Ao lado da padaria Estrela', -23.5239200, -46.5487200, 'empresa'::public.tipo_cliente, 'Nota fiscal solicitada em todos os pedidos.', 'Area de carga', 'Rua Padre Joao, 430 - Penha, Sao Paulo - SP', -23.5239200, -46.5487200, 'Entrada lateral com placa de carga e descarga', 'Chamar gerente antes de posicionar o caminhao.', 1, 8000, 18, 'Abastecimento por tampa superior.'),
    (gen_random_uuid(), 'Roberto Lima', '(11) 97740-9080', 'roberto.lima@example.com', '987.654.321-00', 'Rua dos Cravos, 55 - Vila Prudente, Sao Paulo - SP', 'Casa amarela na esquina', -23.5921800, -46.5815100, 'pessoa_fisica'::public.tipo_cliente, 'Costuma pagar via pix.', 'Casa', 'Rua dos Cravos, 55 - Vila Prudente, Sao Paulo - SP', -23.5921800, -46.5815100, 'Esquina com Rua Tulipa', 'Portao manual. Cliente acompanha a entrega.', 1, 5000, 12, 'Caixa no quintal.'),
    (gen_random_uuid(), 'Clinica Santa Clara', '(11) 3020-7744', 'administracao@santaclara.example.com', '34.567.890/0001-33', 'Avenida Paulista, 1842 - Bela Vista, Sao Paulo - SP', 'Predio comercial com recepcao 24h', -23.5614800, -46.6560200, 'empresa'::public.tipo_cliente, 'Entrega apenas com agendamento confirmado.', 'Entrada de servico', 'Alameda Campinas, 200 - Bela Vista, Sao Paulo - SP', -23.5621300, -46.6553000, 'Entrada atras do predio', 'Usar doca de servico. Proibido estacionar na frente.', 2, 12000, 35, 'Reservatorio no segundo subsolo.'),
    (gen_random_uuid(), 'Marcia Fernandes', '(11) 96531-7742', 'marcia.fernandes@example.com', '456.789.123-45', 'Rua Lagoa Bonita, 310 - Interlagos, Sao Paulo - SP', 'Perto da escola municipal', -23.7024000, -46.6968400, 'pessoa_fisica'::public.tipo_cliente, 'Avisar por WhatsApp 30 minutos antes.', 'Casa Interlagos', 'Rua Lagoa Bonita, 310 - Interlagos, Sao Paulo - SP', -23.7024000, -46.6968400, 'Portao verde', 'Cachorro preso no quintal durante a entrega.', 3, 6000, 22, 'Distribuir entre tres caixas.'),
    (gen_random_uuid(), 'Restaurante Boa Mesa', '(11) 3333-9090', 'financeiro@boamesa.example.com', '45.678.901/0001-44', 'Rua Aurora, 715 - Santa Ifigenia, Sao Paulo - SP', 'Proximo ao Largo do Arouche', -23.5399500, -46.6427500, 'empresa'::public.tipo_cliente, 'Recebimento com gerente do turno.', 'Doca dos fundos', 'Rua dos Gusmoes, 120 - Santa Ifigenia, Sao Paulo - SP', -23.5403200, -46.6431900, 'Portao cinza nos fundos', 'Entrega antes das 10h para nao atrapalhar o almoco.', 1, 10000, 28, 'Mangueira passa pelo corredor de servico.'),
    (gen_random_uuid(), 'Construtora Norte Sul', '(11) 4100-2200', 'obras@nortesul.example.com', '56.789.012/0001-55', 'Estrada do Campo Limpo, 1500 - Campo Limpo, Sao Paulo - SP', 'Canteiro com tapume azul', -23.6498800, -46.7562000, 'empresa'::public.tipo_cliente, 'Cliente compra grandes volumes em dias alternados.', 'Obra Campo Limpo', 'Estrada do Campo Limpo, 1500 - Campo Limpo, Sao Paulo - SP', -23.6498800, -46.7562000, 'Tapume azul com placa da obra', 'Entrada de caminhoes pela rua lateral.', 2, 30000, 8, 'Abastecer reservatorio de obra e caixa auxiliar.'),
    (gen_random_uuid(), 'Escola Novo Horizonte', '(11) 2478-1100', 'secretaria@novohorizonte.example.com', '67.890.123/0001-66', 'Rua Aracati, 240 - Tucuruvi, Sao Paulo - SP', 'Ao lado da quadra poliesportiva', -23.4804700, -46.6049400, 'empresa'::public.tipo_cliente, 'Preferencia por entrega aos sabados.', 'Entrada lateral', 'Rua Aracati, 240 - Tucuruvi, Sao Paulo - SP', -23.4804700, -46.6049400, 'Portao da quadra', 'Falar com zelador no portao lateral.', 2, 15000, 32, 'Reservatorios atras da cozinha.'),
    (gen_random_uuid(), 'Joao Batista Oliveira', '(11) 99802-1313', 'joao.oliveira@example.com', '321.654.987-10', 'Rua Beija-Flor, 98 - Itaquera, Sao Paulo - SP', 'Ultima casa da rua sem saida', -23.5407400, -46.4553200, 'pessoa_fisica'::public.tipo_cliente, 'Rua estreita, caminhao pequeno recomendado.', 'Casa Itaquera', 'Rua Beija-Flor, 98 - Itaquera, Sao Paulo - SP', -23.5407400, -46.4553200, 'Casa com muro baixo', 'Entrar de re. Melhor horario depois das 14h.', 1, 3000, 30, 'Cliente ajuda a posicionar a mangueira.'),
    (gen_random_uuid(), 'Sitio Santa Rita', '(11) 97220-4455', 'santairita@example.com', '789.123.456-78', 'Estrada Municipal Santa Rita, km 7 - Mairipora - SP', 'Entrada de terra depois da ponte', -23.3185100, -46.5847600, 'pessoa_fisica'::public.tipo_cliente, 'Confirmar condicao da estrada em dia de chuva.', 'Entrada do sitio', 'Estrada Municipal Santa Rita, km 7 - Mairipora - SP', -23.3185100, -46.5847600, 'Porteira vermelha', 'Abrir porteira e seguir 300 metros ate a caixa principal.', 3, 18000, 45, 'Pode precisar de mangueira extra.'),
    (gen_random_uuid(), 'Pousada Agua Clara', '(11) 4412-8877', 'reservas@aguaclara.example.com', '78.901.234/0001-77', 'Rua das Nascentes, 410 - Atibaia - SP', 'Proxima ao portal turistico', -23.1167600, -46.5504200, 'empresa'::public.tipo_cliente, 'Movimento maior nos fins de semana.', 'Recepcao', 'Rua das Nascentes, 410 - Atibaia - SP', -23.1167600, -46.5504200, 'Entrada com placa da pousada', 'Avisar recepcao antes de acessar a area tecnica.', 2, 22000, 38, 'Reservatorios atras da lavanderia.')
),
clientes_inseridos as (
  insert into public.clientes (
    id,
    empresa_id,
    nome,
    telefone,
    email,
    cpf_cnpj,
    endereco,
    ponto_referencia,
    latitude,
    longitude,
    tipo,
    observacoes
  )
  select
    dados_clientes.cliente_id,
    empresa_alvo.id,
    dados_clientes.nome,
    dados_clientes.telefone,
    dados_clientes.email,
    dados_clientes.cpf_cnpj,
    dados_clientes.endereco,
    dados_clientes.ponto_referencia,
    dados_clientes.latitude,
    dados_clientes.longitude,
    dados_clientes.tipo,
    dados_clientes.observacoes
  from dados_clientes
  cross join empresa_alvo
  returning id
)
insert into public.locais_entrega (
  empresa_id,
  cliente_id,
  nome,
  endereco,
  latitude,
  longitude,
  ponto_referencia,
  informacoes_acesso,
  quantidade_reservatorios,
  capacidade_total_litros,
  distancia_mangueira_metros,
  observacoes
)
select
  empresa_alvo.id,
  dados_clientes.cliente_id,
  dados_clientes.local_nome,
  dados_clientes.local_endereco,
  dados_clientes.local_latitude,
  dados_clientes.local_longitude,
  dados_clientes.local_ponto_referencia,
  dados_clientes.informacoes_acesso,
  dados_clientes.quantidade_reservatorios,
  dados_clientes.capacidade_total_litros,
  dados_clientes.distancia_mangueira_metros,
  dados_clientes.local_observacoes
from dados_clientes
cross join empresa_alvo;

-- Locais extras para testar clientes com mais de um endereco de entrega.
with empresa_alvo as (
  select id
  from public.empresas
  order by created_at
  limit 1
),
clientes_alvo as (
  select id, nome
  from public.clientes
  where empresa_id = (select id from empresa_alvo)
    and nome in ('Condominio Vale Azul', 'Construtora Norte Sul', 'Pousada Agua Clara')
)
insert into public.locais_entrega (
  empresa_id,
  cliente_id,
  nome,
  endereco,
  latitude,
  longitude,
  ponto_referencia,
  informacoes_acesso,
  quantidade_reservatorios,
  capacidade_total_litros,
  distancia_mangueira_metros,
  observacoes
)
select
  empresa_alvo.id,
  clientes_alvo.id,
  extras.nome_local,
  extras.endereco,
  extras.latitude,
  extras.longitude,
  extras.ponto_referencia,
  extras.informacoes_acesso,
  extras.quantidade_reservatorios,
  extras.capacidade_total_litros,
  extras.distancia_mangueira_metros,
  extras.observacoes
from clientes_alvo
cross join empresa_alvo
join (
  values
    ('Condominio Vale Azul', 'Portaria 2', 'Rua Turiassu, 700 - Barra Funda, Sao Paulo - SP', -23.5270100, -46.6752100, 'Portaria secundaria', 'Usar somente em horario comercial.', 2, 10000, 30, 'Reservatorio da torre B.'),
    ('Construtora Norte Sul', 'Obra Zona Norte', 'Avenida Mazzei, 2200 - Vila Mazzei, Sao Paulo - SP', -23.4722200, -46.5965400, 'Obra ao lado do posto', 'Entrada liberada para caminhoes ate 16h.', 1, 25000, 15, 'Reservatorio provisorio de obra.'),
    ('Pousada Agua Clara', 'Anexo eventos', 'Estrada do Limoeiro, 85 - Atibaia - SP', -23.1211000, -46.5588000, 'Salao de eventos', 'Acessar pela entrada de fornecedores.', 1, 12000, 20, 'Uso em eventos de fim de semana.')
) as extras(cliente_nome, nome_local, endereco, latitude, longitude, ponto_referencia, informacoes_acesso, quantidade_reservatorios, capacidade_total_litros, distancia_mangueira_metros, observacoes)
  on extras.cliente_nome = clientes_alvo.nome;
