# Supabase

Execute os arquivos abaixo no SQL Editor do Supabase, nesta ordem:

1. `schema.sql`
2. `policies.sql`
3. `storage.sql`
4. `seed-example.sql` somente depois de criar o primeiro usuario em Authentication > Users

Se o schema falhar em um projeto ainda vazio por causa de uma tabela criada parcialmente, execute `reset-dev.sql` uma vez e depois rode a ordem acima novamente.

O app usa `perfis.id` igual ao `auth.users.id`. Por isso o primeiro usuario precisa ser criado no Auth antes de inserir o perfil administrativo.

## Primeiro acesso

1. Abra o painel do Supabase.
2. Va em Authentication > Users.
3. Crie um usuario com e-mail e senha.
4. Copie o UUID do usuario.
5. Abra `seed-example.sql`.
6. Substitua `COLE_AQUI_O_UUID_DO_USUARIO_AUTH` pelo UUID copiado.
7. Execute o SQL.
8. Entre no app com o e-mail e senha criados.

## Armazenamento

Os arquivos no Storage devem ser salvos com o `empresa_id` como primeira pasta:

```text
{empresa_id}/{entidade}/{id-do-arquivo}.jpg
```

Exemplo:

```text
uxxx-empresa-id/entregas/foto-chegada.jpg
```
