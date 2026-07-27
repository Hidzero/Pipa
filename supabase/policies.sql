-- Pipa Entregas - politicas RLS
-- Execute depois de schema.sql.

alter table public.empresas enable row level security;
alter table public.perfis enable row level security;
alter table public.clientes enable row level security;
alter table public.locais_entrega enable row level security;
alter table public.caminhoes enable row level security;
alter table public.pedidos enable row level security;
alter table public.agenda_entregas enable row level security;
alter table public.entregas enable row level security;
alter table public.reservatorios_entrega enable row level security;
alter table public.pagamentos enable row level security;
alter table public.recibos enable row level security;
alter table public.combustiveis enable row level security;
alter table public.despesas enable row level security;
alter table public.mensagens_modelo enable row level security;
alter table public.arquivos enable row level security;
alter table public.status_historico enable row level security;
alter table public.sync_logs enable row level security;

drop policy if exists empresas_select_same_company on public.empresas;
create policy empresas_select_same_company
on public.empresas
for select
to authenticated
using (id = public.current_user_empresa_id());

drop policy if exists empresas_update_admin on public.empresas;
create policy empresas_update_admin
on public.empresas
for update
to authenticated
using (id = public.current_user_empresa_id() and public.has_role(array['administrador']::public.user_role[]))
with check (id = public.current_user_empresa_id() and public.has_role(array['administrador']::public.user_role[]));

drop policy if exists perfis_select_same_company on public.perfis;
create policy perfis_select_same_company
on public.perfis
for select
to authenticated
using (id = auth.uid() or empresa_id = public.current_user_empresa_id());

drop policy if exists perfis_insert_admin on public.perfis;
create policy perfis_insert_admin
on public.perfis
for insert
to authenticated
with check (empresa_id = public.current_user_empresa_id() and public.has_role(array['administrador']::public.user_role[]));

drop policy if exists perfis_update_admin on public.perfis;
create policy perfis_update_admin
on public.perfis
for update
to authenticated
using (empresa_id = public.current_user_empresa_id() and public.has_role(array['administrador']::public.user_role[]))
with check (empresa_id = public.current_user_empresa_id() and public.has_role(array['administrador']::public.user_role[]));

drop policy if exists clientes_select_roles on public.clientes;
create policy clientes_select_roles
on public.clientes
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
);

drop policy if exists clientes_insert_admin_atendente on public.clientes;
create policy clientes_insert_admin_atendente
on public.clientes
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists clientes_update_admin_atendente on public.clientes;
create policy clientes_update_admin_atendente
on public.clientes
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists locais_select_roles on public.locais_entrega;
create policy locais_select_roles
on public.locais_entrega
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
);

drop policy if exists locais_insert_admin_atendente on public.locais_entrega;
create policy locais_insert_admin_atendente
on public.locais_entrega
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists locais_update_admin_atendente on public.locais_entrega;
create policy locais_update_admin_atendente
on public.locais_entrega
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists caminhoes_select_roles on public.caminhoes;
create policy caminhoes_select_roles
on public.caminhoes
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
);

drop policy if exists caminhoes_write_admin on public.caminhoes;
create policy caminhoes_write_admin
on public.caminhoes
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador']::public.user_role[])
);

drop policy if exists caminhoes_update_admin on public.caminhoes;
create policy caminhoes_update_admin
on public.caminhoes
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador']::public.user_role[])
);

drop policy if exists pedidos_select_roles on public.pedidos;
create policy pedidos_select_roles
on public.pedidos
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
    or exists (
      select 1
      from public.agenda_entregas a
      where a.pedido_id = pedidos.id
        and a.motorista_id = auth.uid()
    )
  )
);

drop policy if exists pedidos_insert_admin_atendente on public.pedidos;
create policy pedidos_insert_admin_atendente
on public.pedidos
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists pedidos_update_admin_atendente_motorista on public.pedidos;
create policy pedidos_update_admin_atendente_motorista
on public.pedidos
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or exists (
      select 1
      from public.agenda_entregas a
      where a.pedido_id = pedidos.id
        and a.motorista_id = auth.uid()
    )
  )
)
with check (empresa_id = public.current_user_empresa_id());

drop policy if exists agenda_select_roles on public.agenda_entregas;
create policy agenda_select_roles
on public.agenda_entregas
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists agenda_insert_admin_atendente on public.agenda_entregas;
create policy agenda_insert_admin_atendente
on public.agenda_entregas
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists agenda_update_admin_atendente on public.agenda_entregas;
create policy agenda_update_admin_atendente
on public.agenda_entregas
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists entregas_select_roles on public.entregas;
create policy entregas_select_roles
on public.entregas
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists entregas_insert_admin_atendente_motorista on public.entregas;
create policy entregas_insert_admin_atendente_motorista
on public.entregas
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists entregas_update_admin_atendente_motorista on public.entregas;
create policy entregas_update_admin_atendente_motorista
on public.entregas
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or motorista_id = auth.uid()
  )
)
with check (
  empresa_id = public.current_user_empresa_id()
  and (
    public.has_role(array['administrador', 'atendente']::public.user_role[])
    or motorista_id = auth.uid()
  )
);

drop policy if exists reservatorios_select_roles on public.reservatorios_entrega;
create policy reservatorios_select_roles
on public.reservatorios_entrega
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista', 'financeiro']::public.user_role[])
);

drop policy if exists reservatorios_insert_delivery_roles on public.reservatorios_entrega;
create policy reservatorios_insert_delivery_roles
on public.reservatorios_entrega
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista']::public.user_role[])
);

drop policy if exists reservatorios_update_delivery_roles on public.reservatorios_entrega;
create policy reservatorios_update_delivery_roles
on public.reservatorios_entrega
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'motorista']::public.user_role[])
);

drop policy if exists pagamentos_select_admin_financeiro_atendente on public.pagamentos;
create policy pagamentos_select_admin_financeiro_atendente
on public.pagamentos
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
);

drop policy if exists pagamentos_insert_admin_financeiro_motorista on public.pagamentos;
create policy pagamentos_insert_admin_financeiro_motorista
on public.pagamentos
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro', 'motorista']::public.user_role[])
);

drop policy if exists pagamentos_update_admin_financeiro on public.pagamentos;
create policy pagamentos_update_admin_financeiro
on public.pagamentos
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists recibos_select_admin_financeiro_atendente on public.recibos;
create policy recibos_select_admin_financeiro_atendente
on public.recibos
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
);

drop policy if exists recibos_insert_admin_financeiro on public.recibos;
create policy recibos_insert_admin_financeiro
on public.recibos
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists recibos_update_admin_financeiro on public.recibos;
create policy recibos_update_admin_financeiro
on public.recibos
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists combustiveis_select_admin_financeiro on public.combustiveis;
create policy combustiveis_select_admin_financeiro
on public.combustiveis
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists combustiveis_insert_admin_financeiro_motorista on public.combustiveis;
create policy combustiveis_insert_admin_financeiro_motorista
on public.combustiveis
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro', 'motorista']::public.user_role[])
);

drop policy if exists combustiveis_update_admin_financeiro on public.combustiveis;
create policy combustiveis_update_admin_financeiro
on public.combustiveis
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists despesas_select_admin_financeiro on public.despesas;
create policy despesas_select_admin_financeiro
on public.despesas
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists despesas_insert_admin_financeiro on public.despesas;
create policy despesas_insert_admin_financeiro
on public.despesas
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists despesas_update_admin_financeiro on public.despesas;
create policy despesas_update_admin_financeiro
on public.despesas
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'financeiro']::public.user_role[])
);

drop policy if exists mensagens_select_same_company on public.mensagens_modelo;
create policy mensagens_select_same_company
on public.mensagens_modelo
for select
to authenticated
using (empresa_id = public.current_user_empresa_id());

drop policy if exists mensagens_write_admin_atendente on public.mensagens_modelo;
create policy mensagens_write_admin_atendente
on public.mensagens_modelo
for insert
to authenticated
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists mensagens_update_admin_atendente on public.mensagens_modelo;
create policy mensagens_update_admin_atendente
on public.mensagens_modelo
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente']::public.user_role[])
);

drop policy if exists arquivos_select_same_company on public.arquivos;
create policy arquivos_select_same_company
on public.arquivos
for select
to authenticated
using (empresa_id = public.current_user_empresa_id());

drop policy if exists arquivos_insert_same_company on public.arquivos;
create policy arquivos_insert_same_company
on public.arquivos
for insert
to authenticated
with check (empresa_id = public.current_user_empresa_id());

drop policy if exists arquivos_update_admin_financeiro_atendente on public.arquivos;
create policy arquivos_update_admin_financeiro_atendente
on public.arquivos
for update
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
)
with check (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador', 'atendente', 'financeiro']::public.user_role[])
);

drop policy if exists status_historico_select_same_company on public.status_historico;
create policy status_historico_select_same_company
on public.status_historico
for select
to authenticated
using (empresa_id = public.current_user_empresa_id());

drop policy if exists status_historico_insert_same_company on public.status_historico;
create policy status_historico_insert_same_company
on public.status_historico
for insert
to authenticated
with check (empresa_id = public.current_user_empresa_id());

drop policy if exists sync_logs_select_admin on public.sync_logs;
create policy sync_logs_select_admin
on public.sync_logs
for select
to authenticated
using (
  empresa_id = public.current_user_empresa_id()
  and public.has_role(array['administrador']::public.user_role[])
);

drop policy if exists sync_logs_insert_same_company on public.sync_logs;
create policy sync_logs_insert_same_company
on public.sync_logs
for insert
to authenticated
with check (empresa_id = public.current_user_empresa_id());
