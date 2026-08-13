# Fryn Backend - Xiaomi MiMo V2.5 Pro

Gateway privado do Fryn para ate 12 instalacoes. A chave real permanece no Railway e o aplicativo mostra apenas **Fryn AI**.

## Modelo

O modo unico do aplicativo e `Fryn AI`. Por tras, o backend usa `mimo-v2.5-pro` pelo plano pago Xiaomi MiMo Token Plan. Os IDs antigos dos modos continuam aceitos temporariamente, mas todos usam exatamente esse mesmo modo logico.

## Configuracao

1. Configure `MIMO_API_KEY` no Railway.
2. Configure um `FRYN_ADMIN_TOKEN` longo e aleatorio.
3. Remova `FRYN_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENCODE_ZEN_API_KEY`, `OPENCODE_ZEN_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GROQ_API_KEY` e `GROQ_BASE_URL` depois que esta versao estiver ativa.
4. Faca o deploy e confirme que `/health` retorna `ok: true`, `xiaomi-mimo-v2.5-pro` e somente `assistant` em `routing.models`.
5. Use a URL HTTPS do servico como `FRYN_BACKEND_URL` no build do desktop.

`MIMO_BASE_URL` e opcional. O backend usa por padrao `https://token-plan-sgp.xiaomimimo.com/v1`. Se a sua conta mostrar outro Dedicated Base URL, configure esse valor no Railway.

## Limites e privacidade do nivel gratuito

A cota pertence a conta/chave Xiaomi MiMo e e compartilhada por todos os usuarios do Fryn. Ao atingir o limite do plano, a API pode responder com erro de limite e o Fryn informa indisponibilidade temporaria.

Nao envie codigo, documentos ou dados confidenciais da empresa ate revisar os termos de privacidade e retencao do plano MiMo.

## Administracao

Abra `https://SEU_BACKEND/admin` para gerenciar instalacoes. Pelo terminal:

```bash
node admin-cli.mjs list
node admin-cli.mjs revoke INSTALLATION_ID
node admin-cli.mjs restore INSTALLATION_ID
node admin-cli.mjs delete INSTALLATION_ID
```

## Seguranca

- Nunca coloque `MIMO_API_KEY` no instalador.
- Use HTTPS.
- Mantenha confirmacao explicita antes de e-mail, calendario ou qualquer acao externa.
