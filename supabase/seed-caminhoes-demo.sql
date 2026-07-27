-- Caminhoes ficticios para demonstracao
-- Execute no SQL Editor depois de criar a primeira empresa.
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
)
insert into public.caminhoes (
  empresa_id,
  nome,
  placa,
  capacidade_litros,
  quilometragem,
  status,
  consumo_medio_km_l,
  observacoes,
  ativo
)
select
  empresa_alvo.id,
  dados.nome,
  dados.placa,
  dados.capacidade_litros,
  dados.quilometragem,
  dados.status::public.status_caminhao,
  dados.consumo_medio_km_l,
  dados.observacoes,
  dados.ativo
from empresa_alvo
cross join (
  values
    ('Pipa 01 - Mercedes 15.000 L', 'ABC1D23', 15000, 84210.5, 'disponivel', 3.20, 'Caminhao principal para rotas urbanas.', true),
    ('Pipa 02 - Volvo 20.000 L', 'DEF4G56', 20000, 126780.0, 'disponivel', 2.80, 'Usado para grandes volumes e condominios.', true),
    ('Pipa 03 - VW 10.000 L', 'GHI7J89', 10000, 67990.3, 'manutencao', 3.60, 'Revisao preventiva de bomba e mangueiras.', true),
    ('Pipa Reserva - Ford 8.000 L', 'JKL0M12', 8000, 153400.8, 'inativo', 3.90, 'Veiculo reserva, manter inativo ate nova vistoria.', false)
) as dados(nome, placa, capacidade_litros, quilometragem, status, consumo_medio_km_l, observacoes, ativo)
on conflict (empresa_id, placa) do update
set
  nome = excluded.nome,
  capacidade_litros = excluded.capacidade_litros,
  quilometragem = excluded.quilometragem,
  status = excluded.status,
  consumo_medio_km_l = excluded.consumo_medio_km_l,
  observacoes = excluded.observacoes,
  ativo = excluded.ativo,
  updated_at = now();
