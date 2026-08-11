# Integração Microsoft Outlook — plano técnico

## Objetivo

Permitir que cada usuário conecte a própria conta Microsoft para consultar disponibilidade, criar ou alterar reuniões e preparar ou enviar e-mails.

## Arquitetura escolhida

O desktop será um cliente público Microsoft e usará Authorization Code com PKCE pelo navegador do sistema. Os tokens serão armazenados no cofre de credenciais do sistema operacional e as chamadas ao Microsoft Graph serão executadas localmente.

Esta primeira arquitetura evita centralizar tokens do Outlook no Railway. Automações que precisem funcionar com o Fryn fechado exigirão uma fase posterior, com armazenamento criptografado no servidor, política de retenção e auditoria adicionais.

## Registro necessário no Microsoft Entra

1. Criar um App Registration para Fryn.
2. Permitir contas pessoais e contas corporativas.
3. Configurar a plataforma como desktop/mobile e redirect URI apropriada.
4. Registrar o Application (client) ID como configuração de build, nunca como segredo.
5. Solicitar consentimento incremental.

Permissões delegadas iniciais:

- `openid`, `profile`, `offline_access`, `User.Read`
- `Calendars.ReadWrite`
- `Mail.Send`

Adicionar `Mail.Read` somente em uma versão posterior que leia ou resuma a caixa de entrada.

## Ferramentas locais planejadas

- `outlook_list_events`
- `outlook_check_availability`
- `outlook_create_event`
- `outlook_update_event`
- `outlook_cancel_event`
- `outlook_draft_email`
- `outlook_send_email`

## Regra obrigatória de confirmação

Consultar agenda e criar rascunhos pode ocorrer diretamente. Enviar e-mail, criar, alterar ou cancelar evento sempre exige uma prévia estruturada e confirmação explícita do usuário.

O registro de auditoria deve guardar horário, conta, tipo de ação e resultado, mas nunca tokens nem o corpo integral de mensagens.

## Configuração futura

```env
FRYN_MICROSOFT_CLIENT_ID=
FRYN_MICROSOFT_TENANT=common
```

O Client ID identifica o aplicativo e não é secreto. Nenhum client secret deve ser incluído em um aplicativo desktop.
