# Fryn Backend v1.5.4

- troca o upstream para OpenRouter;
- usa `openrouter/free` como modelo unico;
- deixa a OpenRouter escolher um modelo Free disponivel e compativel;
- continua expondo apenas `Fryn AI` para o aplicativo;
- nao usa fallback pago.

## Variaveis do Railway

```text
OPENROUTER_API_KEY=...
FRYN_ADMIN_TOKEN=...
```

`OPENROUTER_BASE_URL` e opcional e deve permanecer ausente no deploy normal. O backend usa `https://openrouter.ai/api/v1` por padrao.

