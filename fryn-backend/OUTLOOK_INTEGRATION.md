# Integracao Microsoft Outlook

## Objetivo

Permitir que cada usuario conecte a propria conta Microsoft para consultar disponibilidade, criar ou alterar reunioes e preparar ou enviar e-mails.

## Arquitetura escolhida

O desktop e um cliente publico Microsoft e usa device code flow. Os tokens ficam gravados localmente no perfil de dados do app e as chamadas ao Microsoft Graph sao executadas localmente.

Esta primeira arquitetura evita centralizar tokens do Outlook no Railway. Automacoes que precisem funcionar com o Fryn fechado exigirao uma fase posterior, com armazenamento criptografado no servidor, politica de retencao e auditoria adicionais.

## Registro Microsoft Entra

Application (client) ID:

```env
FRYN_MICROSOFT_CLIENT_ID=7889876a-1fa9-4165-9d73-bb1d234dde2d
FRYN_MICROSOFT_TENANT=common
```

O Client ID identifica o aplicativo e nao e secreto. Nenhum client secret deve ser incluido em um aplicativo desktop.

Permissoes delegadas iniciais:

- `openid`
- `profile`
- `offline_access`
- `User.Read`
- `Calendars.ReadWrite`
- `Mail.Send`

Adicionar `Mail.Read` somente em uma versao posterior que leia ou resuma a caixa de entrada.

## Ferramentas locais implementadas

- `outlook_connect`
- `outlook_finish_connect`
- `outlook_list_events`
- `outlook_check_availability`
- `outlook_create_event`
- `outlook_draft_email`
- `outlook_send_email`

Ferramentas planejadas para uma proxima versao:

- `outlook_update_event`
- `outlook_cancel_event`

## Regra obrigatoria de confirmacao

Consultar agenda pode ocorrer diretamente. Criar rascunho, enviar e-mail e criar evento sempre exige confirmacao explicita do usuario.

O registro de auditoria deve guardar horario, conta, tipo de acao e resultado, mas nunca tokens nem o corpo integral de mensagens.

## Build Windows

O workflow `Build Fryn Windows` grava essa configuracao no arquivo empacotado `fryn-backend.json`. O valor tambem pode ser sobrescrito por variaveis de repositorio `FRYN_MICROSOFT_CLIENT_ID` e `FRYN_MICROSOFT_TENANT`.
