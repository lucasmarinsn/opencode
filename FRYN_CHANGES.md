# Fryn change manifest

## Estado atual

Fryn foi convertido para uma distribuição corporativa com ativação automática de até **12 instalações**.

## Licenciamento e backend

- Novo `fryn-backend/` sem dependências externas de runtime além de Node 20+.
- Limite padrão de 12 instalações (`FRYN_MAX_LICENSES=12`).
- Cada desktop gera um ID de instalação e recebe somente um token revogável.
- A credencial upstream fica exclusivamente no backend.
- Painel administrativo em `/admin` para listar, revogar, restaurar e liberar instalações.
- Persistência em `licenses.json` com suporte a volume Docker.
- Rate limit por instalação.
- Proxy de streaming e requisições compatíveis com o endpoint OpenAI.
- Respostas são sanitizadas para que identificadores internos do provedor/modelo não cheguem ao desktop.

## Desktop

- Removida a tela de entrada/troca de chave de IA.
- Removidos IPCs e APIs do renderer relacionados à chave de IA.
- Ativação automática ocorre antes do sidecar local iniciar.
- Token de instalação é protegido por Electron `safeStorage` quando disponível.
- O desktop conhece somente `Fryn AI` / `assistant`.
- `fryn-backend.json` é incluído no instalador como recurso de runtime.
- Se a ativação falhar, o usuário recebe apenas uma mensagem genérica para verificar a conexão/contatar o administrador.

## Build Windows

- Workflow `.github/workflows/fryn-windows.yml` exige a variável de repositório `FRYN_BACKEND_URL`.
- A URL é incorporada ao `Fryn-Setup.exe` durante o build.
- `BUILD_FRYN_WINDOWS.bat`/`.ps1` solicita a URL do backend em build local quando necessário.

## Validação executada neste ambiente

- `node --check` passou para o backend e CLI administrativo.
- Parser TypeScript passou nos arquivos TS/TSX alterados.
- Teste local confirmou ativações 1–12.
- A 13ª ativação foi bloqueada com HTTP 403.
- Revogação invalidou o token imediatamente.
- Uma vaga revogada pôde ser reutilizada por uma nova instalação.
- Proxy normal retornou resposta sanitizada.
- Proxy streaming/SSE retornou resposta sanitizada.
- Endpoint administrativo listou corretamente as licenças.

## Limitação do ambiente

O build Electron/NSIS completo ainda depende de Bun e das dependências do monorepo. O workflow incluído executa essa etapa em um runner Windows do GitHub e gera `Fryn-Setup.exe`.

## v1.1 — Roteamento free-first

- Backend agora usa fallback automático de modelos em ordem de prioridade.
- Cadeia padrão: North Mini Code free → Qwen3 Coder free → OpenRouter Free Router → Qwen3.7 Flash (pago opcional).
- A interface continua exibindo somente `Fryn AI` / `assistant`.
- Nomes dos modelos/provedores são sanitizados em respostas normais e streaming.
- `FRYN_ENABLE_PAID_FALLBACK` permite garantir custo zero quando desativado.
- `FRYN_DATA_COLLECTION` e `FRYN_REQUIRE_ZDR` permitem endurecer a política de privacidade.
- Teste de integração do roteamento adicionado em `fryn-backend/test-routing.mjs`.
