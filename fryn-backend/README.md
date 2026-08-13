# Fryn Backend - OpenRouter Free Router

Gateway privado do Fryn para ate 12 instalacoes. A chave real permanece no Railway e o aplicativo mostra apenas **Fryn AI**.

## Modelo

O modo unico do aplicativo e `Fryn AI`. Por tras, o backend usa `openrouter/free`, o roteador gratuito da OpenRouter que escolhe um modelo Free disponivel conforme os requisitos da chamada. Os IDs antigos dos modos continuam aceitos temporariamente, mas todos usam exatamente esse mesmo modo logico.

## Configuracao

1. Configure `OPENROUTER_API_KEY` no Railway.
2. Configure um `FRYN_ADMIN_TOKEN` longo e aleatorio.
3. Remova `FRYN_MODEL`, `OPENCODE_ZEN_API_KEY`, `OPENCODE_ZEN_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GROQ_API_KEY` e `GROQ_BASE_URL` depois que esta versao estiver ativa.
4. Faca o deploy e confirme que `/health` retorna `ok: true`, `openrouter-free-router` e somente `assistant` em `routing.models`.
5. Use a URL HTTPS do servico como `FRYN_BACKEND_URL` no build do desktop.

`OPENROUTER_BASE_URL` e opcional e deve permanecer ausente no Railway. O backend usa por padrao `https://openrouter.ai/api/v1`.

## Limites e privacidade do nivel gratuito

A cota pertence a conta/chave da OpenRouter e e compartilhada por todos os usuarios do Fryn. Ao atingir o limite gratuito, a API pode responder com HTTP 429 e o Fryn informa indisponibilidade temporaria.

Modelos Free podem ter limites, disponibilidade variavel e politicas proprias de retencao/treinamento. Nao envie codigo, documentos ou dados confidenciais da empresa nessa modalidade.

## Administracao

Abra `https://SEU_BACKEND/admin` para gerenciar instalacoes. Pelo terminal:

```bash
node admin-cli.mjs list
node admin-cli.mjs revoke INSTALLATION_ID
node admin-cli.mjs restore INSTALLATION_ID
node admin-cli.mjs delete INSTALLATION_ID
```

## Seguranca

- Nunca coloque `OPENROUTER_API_KEY` no instalador.
- Use HTTPS.
- Mantenha confirmacao explicita antes de e-mail, calendario ou qualquer acao externa.
