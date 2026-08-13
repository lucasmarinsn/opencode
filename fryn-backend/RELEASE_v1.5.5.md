# Fryn Backend v1.5.5

- troca o upstream para Xiaomi MiMo Token Plan;
- usa `mimo-v2.5-pro` como modelo unico;
- usa endpoint OpenAI-compatible do MiMo;
- continua expondo apenas `Fryn AI` para o aplicativo.

## Variaveis do Railway

```text
MIMO_API_KEY=...
FRYN_ADMIN_TOKEN=...
```

Opcional, somente se o painel MiMo mostrar outro Dedicated Base URL:

```text
MIMO_BASE_URL=https://token-plan-sgp.xiaomimimo.com/v1
```

Remova variaveis antigas como `OPENROUTER_API_KEY`, `OPENCODE_ZEN_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` e `FRYN_MODEL`.

