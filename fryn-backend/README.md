# Fryn Backend — modelo único

Gateway privado do Fryn para até 12 instalações. A chave real permanece no Railway e o aplicativo mostra apenas **Fryn AI**.

## Modelo

O único modelo é `openai/gpt-oss-120b`, servido diretamente pela Groq. Os IDs antigos dos modos continuam aceitos temporariamente, mas todos usam exatamente esse mesmo modelo. Não existe fallback pago ou troca silenciosa de provedor.

## Configuração

1. Configure `GROQ_API_KEY` no Railway.
2. Configure um `FRYN_ADMIN_TOKEN` longo e aleatório.
3. Mantenha `FRYN_MODEL=openai/gpt-oss-120b`.
4. Faça o deploy e confirme que `/health` retorna `ok: true` e somente `assistant` em `routing.models`.
5. Use a URL HTTPS do serviço como `FRYN_BACKEND_URL` no build do desktop.

As variáveis antigas do OpenRouter e Gemini não são mais utilizadas e podem ser removidas do Railway depois que esta versão estiver ativa.

## Limites gratuitos

A cota pertence à organização da chave Groq e é compartilhada por todos os usuários do Fryn. Ao atingir o limite gratuito, a Groq responde com HTTP 429 e o Fryn informa indisponibilidade temporária.

## Administração

Abra `https://SEU_BACKEND/admin` para gerenciar instalações. Pelo terminal:

```bash
node admin-cli.mjs list
node admin-cli.mjs revoke INSTALLATION_ID
node admin-cli.mjs restore INSTALLATION_ID
node admin-cli.mjs delete INSTALLATION_ID
```

## Segurança

- Nunca coloque `GROQ_API_KEY` no instalador.
- Use HTTPS.
- Mantenha confirmação explícita antes de e-mail, calendário ou qualquer ação externa.
