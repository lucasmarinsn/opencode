# Fryn Backend - modelo unico

Gateway privado do Fryn para ate 12 instalacoes. A chave real permanece no Railway e o aplicativo mostra apenas **Fryn AI**.

## Modelo

O unico modelo e `gemini-3.6-flash`, servido diretamente pela API Gemini da Google. Ele oferece contexto de 1.048.576 tokens, entrada de texto e imagem, chamadas de ferramentas e resposta em streaming. Os IDs antigos dos modos continuam aceitos temporariamente, mas todos usam exatamente esse mesmo modelo. Nao existe fallback pago ou troca silenciosa de provedor.

## Configuracao

1. Configure `GEMINI_API_KEY` no Railway.
2. Configure um `FRYN_ADMIN_TOKEN` longo e aleatorio.
3. Remova `FRYN_MODEL`, `GROQ_API_KEY`, `GROQ_BASE_URL` e variaveis antigas do OpenRouter depois que esta versao estiver ativa.
4. Faca o deploy e confirme que `/health` retorna `ok: true`, `google-gemini-free-tier` e somente `assistant` em `routing.models`.
5. Use a URL HTTPS do servico como `FRYN_BACKEND_URL` no build do desktop.

`GEMINI_BASE_URL` e opcional e deve permanecer ausente no Railway. O backend usa por padrao o endpoint oficial compativel com OpenAI da API Gemini.

## Limites e privacidade do nivel gratuito

A cota pertence ao projeto da chave Gemini e e compartilhada por todos os usuarios do Fryn. Ao atingir o limite gratuito, a API responde com HTTP 429 e o Fryn informa indisponibilidade temporaria.

No nivel gratuito, a Google pode usar entradas e respostas para melhorar seus produtos. Nao envie codigo, documentos ou dados confidenciais da empresa. Para uso corporativo com dados privados, associe faturamento ao projeto Gemini; no nivel pago, a Google informa que os dados nao sao usados para melhorar os produtos.

## Administracao

Abra `https://SEU_BACKEND/admin` para gerenciar instalacoes. Pelo terminal:

```bash
node admin-cli.mjs list
node admin-cli.mjs revoke INSTALLATION_ID
node admin-cli.mjs restore INSTALLATION_ID
node admin-cli.mjs delete INSTALLATION_ID
```

## Seguranca

- Nunca coloque `GEMINI_API_KEY` no instalador.
- Use HTTPS.
- Mantenha confirmacao explicita antes de e-mail, calendario ou qualquer acao externa.
