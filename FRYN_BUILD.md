# Fryn — build e distribuição corporativa

## Arquitetura

`Fryn-Setup.exe → token de instalação → Fryn Backend → IA`

O `.exe` não contém a chave real da IA. Na primeira execução, o desktop registra automaticamente uma das 12 instalações disponíveis no backend e recebe apenas um token revogável.

## Funcionário

O funcionário não configura nada relacionado a IA. Ele instala `Fryn-Setup.exe` e abre o Fryn. O app exibe apenas **Fryn AI**.

## Administrador

A pasta `fryn-backend/` contém o servidor privado. Configure as variáveis de `.env.example`, publique o serviço e use `/admin` para controlar as instalações.

## Windows

No GitHub Actions, defina a variável `FRYN_BACKEND_URL` e execute o workflow **Build Fryn Windows**. Para build local, `BUILD_FRYN_WINDOWS.bat` solicita a URL do backend se ela ainda estiver apontando para localhost.

O resultado é `Fryn-Setup.exe`.

## Segurança

A credencial upstream fica somente no backend. Cada desktop guarda um token de licença revogável usando Electron `safeStorage` quando disponível. Para uso por internet, publique o backend em HTTPS.
