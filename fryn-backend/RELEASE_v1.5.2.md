# Fryn Backend v1.5.2

- troca o modelo upstream do OpenCode Zen de `mimo-v2.5-free` para `north-mini-code-free`;
- mantem todos os modos antigos do Fryn apontando para `assistant`;
- mantem a chave real somente no Railway e exibe apenas `Fryn AI` no aplicativo.

## Variaveis do Railway

```text
OPENCODE_ZEN_API_KEY=...
FRYN_ADMIN_TOKEN=...
```

O modelo e fixado no codigo. `OPENCODE_ZEN_BASE_URL` e opcional e deve permanecer ausente no deploy normal.

