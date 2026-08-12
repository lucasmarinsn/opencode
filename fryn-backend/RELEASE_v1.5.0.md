# Fryn Backend v1.5.0

- troca o provedor unico da Groq pela API Gemini direta;
- usa `gemini-3.6-flash` como unico modelo;
- amplia o contexto anunciado pelo desktop para 1.048.576 tokens;
- habilita entrada de imagens;
- antecipa a compactacao para deixar uma margem segura em conversas longas;
- mantem a chave real somente no Railway e exibe apenas `Fryn AI` no aplicativo.

## Variaveis do Railway

```text
GEMINI_API_KEY=...
FRYN_ADMIN_TOKEN=...
```

O modelo e fixado no codigo. Remova `FRYN_MODEL` do Railway para nao manter configuracao obsoleta. `GEMINI_BASE_URL` e opcional e nao deve ser alterada no deploy normal.
