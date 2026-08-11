# Fryn Backend — licenças e modelos especializados

Gateway privado do Fryn. Mantém as credenciais reais fora do `.exe`, autoriza até 12 instalações por padrão e expõe somente modelos lógicos com a marca Fryn.

## Modelos visíveis

| ID lógico | Nome | Provedor padrão | Disponibilidade |
| --- | --- | --- | --- |
| `fryn-code` | Fryn Code | North Mini Code via OpenRouter | Sempre |
| `fryn-fast` | Fryn Fast | GPT-OSS 120B via Groq | Com `GROQ_API_KEY` |
| `fryn-expert` | Fryn Expert | Laguna M.1 via OpenRouter | Sempre |
| `fryn-plan` | Fryn Plan | Nemotron 3 Ultra via OpenRouter | Sempre |
| `fryn-vision` | Fryn Vision | Gemini Flash | Com `GEMINI_API_KEY` |

O modelo legado `assistant` continua aceito e é encaminhado para `FRYN_DEFAULT_MODEL`, permitindo atualizar o backend antes de substituir todas as instalações.

Cada escolha usa uma rota direta. Somente `fryn-code` pode tentar o fallback pago configurado quando sua rota principal retorna indisponibilidade ou rate limit. Os demais modos não tentam modelos diferentes silenciosamente.

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha `OPENROUTER_API_KEY` e um `FRYN_ADMIN_TOKEN` longo e aleatório.
3. Adicione `GROQ_API_KEY` para habilitar Fryn Fast.
4. Adicione `GEMINI_API_KEY` para habilitar Fryn Vision.
5. Rode `docker compose up -d --build` ou `node server.mjs`.
6. Publique em HTTPS e use a URL como `FRYN_BACKEND_URL` no build do desktop.

As chaves opcionais controlam também a lista retornada por `/v1/models`: um modo nunca aparece quando seu provedor não está configurado.

## Desempenho

`FRYN_UPSTREAM_TIMEOUT_SECONDS` limita quanto uma tentativa pode esperar. O padrão é 45 segundos. O endpoint administrativo `GET /admin/api/metrics` retorna solicitações, sucessos, falhas e latência por modelo lógico desde o último início do servidor.

## Privacidade

`FRYN_DATA_COLLECTION=allow` prioriza disponibilidade nas rotas gratuitas do OpenRouter. Para código corporativo sensível, use:

```env
FRYN_DATA_COLLECTION=deny
FRYN_REQUIRE_ZDR=true
```

Rotas gratuitas podem não aceitar Zero Data Retention. Verifique os termos de cada provedor antes de oferecer o serviço a clientes.

## Administração

Abra `https://SEU_BACKEND/admin` para gerenciar instalações. Pelo terminal, com `FRYN_BACKEND_URL` e `FRYN_ADMIN_TOKEN` definidos:

```bash
node admin-cli.mjs list
node admin-cli.mjs revoke INSTALLATION_ID
node admin-cli.mjs restore INSTALLATION_ID
node admin-cli.mjs delete INSTALLATION_ID
```

## Segurança

- Nunca coloque chaves dos provedores no instalador.
- Use HTTPS.
- Defina limites de gasto nos provedores pagos.
- Mantenha confirmação explícita antes de e-mail, calendário ou qualquer ação externa.
