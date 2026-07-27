-- Pipa Entregas - schema inicial
-- Execute este arquivo no SQL Editor do Supabase antes de policies.sql e storage.sql.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('administrador', 'atendente', 'motorista', 'financeiro');
  end if;

  if not exists (select 1 from pg_type where typname = 'tipo_cliente') then
    create type public.tipo_cliente as enum ('pessoa_fisica', 'pessoa_juridica', 'condominio', 'empresa', 'orgao_publico', 'outro');
  end if;

  if not exists (select 1 from pg_type where typname = 'status_caminhao') then
    create type public.status_caminhao as enum ('disponivel', 'em_rota', 'manutencao', 'inativo');
  end if;

  if not exists (select 1 from pg_type where typname = 'pedido_status') then
    create type public.pedido_status as enum ('aguardando_confirmacao', 'confirmado', 'agendado', 'em_rota', 'em_entrega', 'concluido', 'cancelado');
  end if;

  if not exists (select 1 from pg_type where typname = 'prioridade_pedido') then
    create type public.prioridade_pedido as enum ('baixa', 'normal', 'alta', 'urgente');
  end if;

  if not exists (select 1 from pg_type where typname = 'forma_pagamento') then
    create type public.forma_pagamento as enum ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro');
  end if;

  if not exists (select 1 from pg_type where typname = 'pagamento_status') then
    create type public.pagamento_status as enum ('pago', 'parcial', 'pendente', 'vencido', 'cancelado');
  end if;

  if not exists (select 1 from pg_type where typname = 'registro_status') then
    create type public.registro_status as enum ('ativo', 'cancelado', 'inativo');
  end if;

  if not exists (select 1 from pg_type where typname = 'recibo_status') then
    create type public.recibo_status as enum ('gerado', 'cancelado');
  end if;
end $$;

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,
  telefone text,
  email text,
  endereco text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nome text not null,
  telefone text,
  funcao public.user_role not null default 'atendente',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nome text not null,
  telefone text,
  email text,
  cpf_cnpj text,
  endereco text,
  ponto_referencia text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  observacoes text,
  tipo public.tipo_cliente not null default 'pessoa_fisica',
  ativo boolean not null default true,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint clientes_longitude_check check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.locais_entrega (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  nome text,
  endereco text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  ponto_referencia text,
  foto_entrada_path text,
  informacoes_acesso text,
  quantidade_reservatorios integer not null default 1,
  capacidade_total_litros integer,
  distancia_mangueira_metros integer,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locais_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint locais_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint locais_qtd_reservatorios_check check (quantidade_reservatorios > 0),
  constraint locais_capacidade_check check (capacidade_total_litros is null or capacidade_total_litros >= 0),
  constraint locais_distancia_mangueira_check check (distancia_mangueira_metros is null or distancia_mangueira_metros >= 0)
);

create table if not exists public.caminhoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  nome text not null,
  placa text not null,
  capacidade_litros integer not null,
  quilometragem numeric(12, 1) not null default 0,
  motorista_responsavel_id uuid references public.perfis(id) on delete set null,
  status public.status_caminhao not null default 'disponivel',
  consumo_medio_km_l numeric(8, 2),
  observacoes text,
  ativo boolean not null default true,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caminhoes_capacidade_check check (capacidade_litros > 0),
  constraint caminhoes_quilometragem_check check (quilometragem >= 0),
  constraint caminhoes_consumo_check check (consumo_medio_km_l is null or consumo_medio_km_l > 0),
  constraint caminhoes_empresa_placa_unique unique (empresa_id, placa)
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  local_entrega_id uuid not null references public.locais_entrega(id) on delete restrict,
  quantidade_solicitada_litros integer not null,
  data_hora_solicitada timestamptz,
  valor_total numeric(12, 2) not null default 0,
  forma_pagamento public.forma_pagamento,
  prioridade public.prioridade_pedido not null default 'normal',
  observacoes text,
  status public.pedido_status not null default 'aguardando_confirmacao',
  criado_por uuid references public.perfis(id) on delete set null,
  confirmado_por uuid references public.perfis(id) on delete set null,
  confirmado_em timestamptz,
  cancelado_por uuid references public.perfis(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pedidos_quantidade_check check (quantidade_solicitada_litros > 0),
  constraint pedidos_valor_check check (valor_total >= 0)
);

create table if not exists public.agenda_entregas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  pedido_id uuid not null unique references public.pedidos(id) on delete restrict,
  motorista_id uuid references public.perfis(id) on delete set null,
  caminhao_id uuid references public.caminhoes(id) on delete set null,
  data_inicio timestamptz not null,
  data_fim timestamptz,
  ordem integer not null default 1,
  observacoes text,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agenda_ordem_check check (ordem > 0),
  constraint agenda_periodo_check check (data_fim is null or data_fim >= data_inicio)
);

create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  numero_entrega bigint generated always as identity,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  pedido_id uuid not null unique references public.pedidos(id) on delete restrict,
  agenda_id uuid references public.agenda_entregas(id) on delete set null,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  local_entrega_id uuid not null references public.locais_entrega(id) on delete restrict,
  motorista_id uuid references public.perfis(id) on delete set null,
  caminhao_id uuid references public.caminhoes(id) on delete set null,
  horario_chegada timestamptz,
  horario_saida timestamptz,
  quilometragem_chegada numeric(12, 1),
  quilometragem_saida numeric(12, 1),
  quantidade_entregue_litros integer not null default 0,
  entrega_parcial boolean not null default false,
  nome_recebedor text,
  forma_pagamento public.forma_pagamento,
  valor_recebido numeric(12, 2) not null default 0,
  foto_path text,
  assinatura_path text,
  observacoes text,
  status public.pedido_status not null default 'em_entrega',
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entregas_quantidade_check check (quantidade_entregue_litros >= 0),
  constraint entregas_valor_recebido_check check (valor_recebido >= 0),
  constraint entregas_horarios_check check (horario_saida is null or horario_chegada is null or horario_saida >= horario_chegada),
  constraint entregas_km_check check (
    quilometragem_chegada is null
    or quilometragem_saida is null
    or quilometragem_saida >= quilometragem_chegada
  )
);

create table if not exists public.reservatorios_entrega (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  entrega_id uuid not null references public.entregas(id) on delete cascade,
  descricao text,
  capacidade_litros integer,
  quantidade_entregue_litros integer not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservatorios_capacidade_check check (capacidade_litros is null or capacidade_litros >= 0),
  constraint reservatorios_quantidade_check check (quantidade_entregue_litros >= 0)
);

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  pedido_id uuid references public.pedidos(id) on delete restrict,
  entrega_id uuid references public.entregas(id) on delete set null,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  valor_total numeric(12, 2) not null default 0,
  valor_pago numeric(12, 2) not null default 0,
  valor_pendente numeric(12, 2) generated always as (greatest(valor_total - valor_pago, 0)) stored,
  forma_pagamento public.forma_pagamento,
  data_vencimento date,
  data_pagamento date,
  comprovante_path text,
  status public.pagamento_status not null default 'pendente',
  observacoes text,
  cancelado_por uuid references public.perfis(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pagamentos_valores_check check (valor_total >= 0 and valor_pago >= 0),
  constraint pagamentos_pedido_ou_entrega_check check (pedido_id is not null or entrega_id is not null)
);

create table if not exists public.recibos (
  id uuid primary key default gen_random_uuid(),
  numero_recibo bigint generated always as identity,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  entrega_id uuid not null unique references public.entregas(id) on delete restrict,
  pagamento_id uuid references public.pagamentos(id) on delete set null,
  pdf_path text,
  status public.recibo_status not null default 'gerado',
  compartilhado_whatsapp_em timestamptz,
  cancelado_por uuid references public.perfis(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.combustiveis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  caminhao_id uuid not null references public.caminhoes(id) on delete restrict,
  data date not null default current_date,
  quilometragem numeric(12, 1) not null,
  litros numeric(10, 3) not null,
  valor_litro numeric(10, 3) not null,
  valor_total numeric(12, 2) generated always as (round((litros * valor_litro)::numeric, 2)) stored,
  posto text,
  comprovante_path text,
  status public.registro_status not null default 'ativo',
  cancelado_por uuid references public.perfis(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combustiveis_valores_check check (quilometragem >= 0 and litros > 0 and valor_litro >= 0)
);

create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  categoria text not null,
  data date not null default current_date,
  valor numeric(12, 2) not null,
  caminhao_id uuid references public.caminhoes(id) on delete set null,
  descricao text,
  comprovante_path text,
  status public.registro_status not null default 'ativo',
  cancelado_por uuid references public.perfis(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint despesas_valor_check check (valor >= 0)
);

create table if not exists public.mensagens_modelo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  tipo text not null,
  titulo text not null,
  texto text not null,
  ativo boolean not null default true,
  created_by uuid references public.perfis(id) on delete set null,
  updated_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mensagens_empresa_tipo_unique unique (empresa_id, tipo)
);

create table if not exists public.arquivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  entidade_tipo text not null,
  entidade_id uuid,
  bucket text not null,
  path text not null,
  mime_type text,
  tamanho_bytes bigint,
  created_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint arquivos_path_unique unique (bucket, path)
);

create table if not exists public.status_historico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  entidade_tipo text not null,
  entidade_id uuid not null,
  status_anterior text,
  status_novo text not null,
  observacao text,
  created_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  dispositivo_id text,
  entidade_tipo text not null,
  entidade_id uuid,
  acao text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'recebido',
  erro text,
  created_by uuid references public.perfis(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id
  from public.perfis
  where id = auth.uid()
    and ativo = true
  limit 1;
$$;

create or replace function public.current_user_funcao()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select funcao
  from public.perfis
  where id = auth.uid()
    and ativo = true
  limit 1;
$$;

create or replace function public.has_role(allowed_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_funcao() = any(allowed_roles), false);
$$;

create or replace function public.is_same_empresa(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(target_empresa_id = public.current_user_empresa_id(), false);
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'empresas',
    'perfis',
    'clientes',
    'locais_entrega',
    'caminhoes',
    'pedidos',
    'agenda_entregas',
    'entregas',
    'reservatorios_entrega',
    'pagamentos',
    'recibos',
    'combustiveis',
    'despesas',
    'mensagens_modelo'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', target_table);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      target_table
    );
  end loop;
end $$;

create index if not exists perfis_empresa_idx on public.perfis (empresa_id);
create index if not exists clientes_empresa_nome_idx on public.clientes (empresa_id, nome);
create index if not exists locais_empresa_cliente_idx on public.locais_entrega (empresa_id, cliente_id);
create index if not exists caminhoes_empresa_status_idx on public.caminhoes (empresa_id, status);
create index if not exists pedidos_empresa_status_data_idx on public.pedidos (empresa_id, status, data_hora_solicitada);
create index if not exists pedidos_empresa_cliente_idx on public.pedidos (empresa_id, cliente_id);
create index if not exists agenda_empresa_data_idx on public.agenda_entregas (empresa_id, data_inicio);
create index if not exists agenda_motorista_data_idx on public.agenda_entregas (motorista_id, data_inicio);
create index if not exists entregas_empresa_data_idx on public.entregas (empresa_id, created_at);
create index if not exists entregas_motorista_data_idx on public.entregas (motorista_id, created_at);
create index if not exists pagamentos_empresa_status_idx on public.pagamentos (empresa_id, status);
create index if not exists pagamentos_cliente_idx on public.pagamentos (cliente_id);
create index if not exists combustiveis_empresa_data_idx on public.combustiveis (empresa_id, data);
create index if not exists despesas_empresa_data_idx on public.despesas (empresa_id, data);
create index if not exists arquivos_empresa_entidade_idx on public.arquivos (empresa_id, entidade_tipo, entidade_id);
create index if not exists status_historico_entidade_idx on public.status_historico (empresa_id, entidade_tipo, entidade_id, created_at);

grant usage on schema public to authenticated;
grant select, insert, update on public.empresas to authenticated;
grant select, insert, update on public.perfis to authenticated;
grant select, insert, update on public.clientes to authenticated;
grant select, insert, update on public.locais_entrega to authenticated;
grant select, insert, update on public.caminhoes to authenticated;
grant select, insert, update on public.pedidos to authenticated;
grant select, insert, update on public.agenda_entregas to authenticated;
grant select, insert, update on public.entregas to authenticated;
grant select, insert, update on public.reservatorios_entrega to authenticated;
grant select, insert, update on public.pagamentos to authenticated;
grant select, insert, update on public.recibos to authenticated;
grant select, insert, update on public.combustiveis to authenticated;
grant select, insert, update on public.despesas to authenticated;
grant select, insert, update on public.mensagens_modelo to authenticated;
grant select, insert, update on public.arquivos to authenticated;
grant select, insert on public.status_historico to authenticated;
grant select, insert on public.sync_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;
