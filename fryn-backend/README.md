# Fryn Backend - North Mini Code Free

Gateway privado do Fryn para ate 12 instalacoes. A chave real permanece no Railway e o aplicativo mostra apenas **Fryn AI**.

## Modelo

O unico modelo e `north-mini-code-free`, servido pelo OpenCode Zen em endpoint compativel com OpenAI. Os IDs antigos dos modos continuam aceitos temporariamente, mas todos usam exatamente esse mesmo modelo. Nao existe fallback pago ou troca silenciosa de provedor.

## Configuracao

1. Configure `OPENCODE_ZEN_API_KEY` no Railway.
2. Configure um `FRYN_ADMIN_TOKEN` longo e aleatorio.
3. Remova `FRYN_MODEL`, `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GROQ_API_KEY`, `GROQ_BASE_URL` e variaveis antigas do OpenRouter depois que esta versao estiver ativa.
4. Faca o deploy e confirme que `/health` retorna `ok: true`, `opencode-zen-north-mini-code-free` e somente `assistant` em `routing.models`.
5. Use a URL HTTPS do servico como `FRYN_BACKEND_URL` no build do desktop.

`OPENCODE_ZEN_BASE_URL` e opcional e deve permanecer ausente no Railway. O backend usa por padrao `https://opencode.ai/zen/v1`.

## Limites e privacidade do nivel gratuito

A cota pertence a conta/chave do OpenCode Zen e e compartilhada por todos os usuarios do Fryn. Ao atingir o limite gratuito, a API pode responder com HTTP 429 e o Fryn informa indisponibilidade temporaria.

Segundo a documentacao do OpenCode Zen, os modelos Free podem ter limites e politicas proprias. Nao envie codigo, documentos ou dados confidenciais da empresa nessa modalidade.

## Administracao

Abra `https://SEU_BACKEND/admin` para gerenciar instalacoes. Pelo terminal:

```bash
node admin-cli.mjs list
node admin-cli.mjs revoke INSTALLATION_ID
node admin-cli.mjs restore INSTALLATION_ID
node admin-cli.mjs delete INSTALLATION_ID
```

## Seguranca

- Nunca coloque `OPENCODE_ZEN_API_KEY` no instalador.
- Use HTTPS.
- Mantenha confirmacao explicita antes de e-mail, calendario ou qualquer acao externa.
