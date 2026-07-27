# Configuracao de URL no Supabase Auth

No painel do Supabase, va em Authentication > URL Configuration e use:

```text
Site URL:
https://pipa-six.vercel.app
```

Em Redirect URLs, adicione:

```text
https://pipa-six.vercel.app
https://pipa-six.vercel.app/
http://localhost:4173
http://localhost:4173/
```

Os redirects de recuperacao de senha do app apontam para `https://pipa-six.vercel.app/` quando o app esta em producao. Em ambiente local, continuam usando a URL local aberta no navegador.
