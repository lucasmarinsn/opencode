# Fryn Backend v1.2.0

## Entregue

- modelos lógicos Fryn Code, Fryn Expert e Fryn Plan;
- Fryn Fast habilitado automaticamente com `GROQ_API_KEY`;
- Fryn Vision habilitado automaticamente com `GEMINI_API_KEY`;
- seleção direta, sem cadeia gratuita para todos os modos;
- compatibilidade do modelo legado `assistant` com Fryn Code;
- timeout configurável por tentativa;
- métricas administrativas de latência, sucesso e falha;
- sanitização de nomes de modelos e provedores;
- teste multiplataforma sem subprocesso;
- plano técnico da integração Outlook com OAuth PKCE e confirmação obrigatória.

## Configuração necessária no Railway

Obrigatória para as rotas já existentes:

```env
OPENROUTER_API_KEY=...
FRYN_DEFAULT_MODEL=fryn-code
FRYN_UPSTREAM_TIMEOUT_SECONDS=45
```

Opcional para Fryn Fast:

```env
GROQ_API_KEY=...
FRYN_FAST_MODEL=openai/gpt-oss-120b
```

Opcional para Fryn Vision:

```env
GEMINI_API_KEY=...
FRYN_VISION_MODEL=gemini-3.6-flash
```

## Próxima etapa externa

A implementação funcional do Outlook precisa do Application (client) ID de um App Registration Microsoft Entra configurado para aplicativo desktop. Nenhum client secret deve ser colocado no `.exe`.
