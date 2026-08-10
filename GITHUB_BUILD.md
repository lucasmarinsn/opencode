# Gerar o Fryn-Setup.exe pelo GitHub

O Fryn agora usa um backend privado para ativar automaticamente no máximo **12 instalações**. O funcionário não informa chave, provedor ou modelo.

## Antes de gerar o instalador

1. Suba a pasta `fryn-backend/` em um servidor seu (preferencialmente HTTPS).
2. No servidor, configure `OPENROUTER_API_KEY`, `FRYN_ADMIN_TOKEN` e `FRYN_MAX_LICENSES=12`.
3. Confirme que `https://SEU_BACKEND/health` responde com `ok: true`.
4. No GitHub, abra **Settings → Secrets and variables → Actions → Variables**.
5. Crie a variável de repositório `FRYN_BACKEND_URL` com a URL do backend, sem `/v1` no final. Exemplo: `https://fryn-api.seudominio.com`.

## Gerando o Windows

1. Envie este projeto para o seu repositório.
2. Abra **Actions**.
3. Execute **Build Fryn Windows**.
4. Baixe o artifact **Fryn-Windows**.
5. Dentro dele estará `Fryn-Setup.exe`.

A URL do backend é incorporada ao instalador durante o build. Depois disso, o funcionário recebe somente o `.exe`, instala e usa.

## Gerenciando as 12 vagas

Abra `https://SEU_BACKEND/admin`, informe seu `FRYN_ADMIN_TOKEN` e você verá todas as instalações. **Revogar** bloqueia imediatamente uma máquina; **Excluir/liberar** remove o registro e deixa a vaga disponível para um novo PC.
