# Fryn Backend v1.5.1

- troca o provedor unico de Gemini para OpenCode Zen;
- usa `mimo-v2.5-free` como unico modelo upstream;
- mantem todos os modos antigos do Fryn apontando para `assistant`;
- mantem a chave real somente no Railway e exibe apenas `Fryn AI` no aplicativo.

## Variaveis do Railway

```text
OPENCODE_ZEN_API_KEY=...
FRYN_ADMIN_TOKEN=...
```

O modelo e fixado no codigo. Remova `FRYN_MODEL`, `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GROQ_API_KEY`, `GROQ_BASE_URL` e variaveis antigas do OpenRouter para evitar configuracoes obsoletas.

`OPENCODE_ZEN_BASE_URL` e opcional e deve permanecer ausente no deploy normal. O backend usa `https://opencode.ai/zen/v1` por padrao.

