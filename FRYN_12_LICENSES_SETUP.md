# Fryn — entrega corporativa para 12 computadores

O Fryn foi preparado para funcionar sem nenhuma chave ou seleção de modelo no computador do funcionário.

## Arquitetura final

```text
Funcionario
  -> instala Fryn-Setup.exe
  -> Fryn registra automaticamente uma vaga (1 de 12)
  -> recebe um token revogavel de instalacao
  -> envia as requisicoes ao Fryn Backend
  -> o backend usa a credencial real de IA
```

A credencial real de IA nunca é gravada no `.exe` nem no computador do funcionário.

## 1. Subir o Fryn Backend

A pasta `fryn-backend/` é o servidor privado.

Copie:

```text
fryn-backend/.env.example -> fryn-backend/.env
```

Preencha no servidor:

```env
OPENROUTER_API_KEY=sua-chave-real
FRYN_ADMIN_TOKEN=uma-senha-administrativa-longa-e-aleatoria
FRYN_MAX_LICENSES=12
PORT=8787
FRYN_DATA_DIR=./data
```

Depois rode:

```bash
docker compose up -d --build
```

Use HTTPS para uma implantação acessível pela internet.

## 2. Testar o backend

Abra:

```text
https://SEU_BACKEND/health
```

A resposta deve conter `"ok": true`.

O painel administrativo fica em:

```text
https://SEU_BACKEND/admin
```

Entre com `FRYN_ADMIN_TOKEN`.

## 3. Gerar o executável já apontando para o backend

No GitHub:

1. `Settings`
2. `Secrets and variables`
3. `Actions`
4. `Variables`
5. Crie `FRYN_BACKEND_URL`
6. Valor: `https://SEU_BACKEND`

Depois execute:

```text
Actions -> Build Fryn Windows -> Run workflow
```

Baixe o artifact `Fryn-Windows`. Dentro estará:

```text
Fryn-Setup.exe
```

## 4. Entrega aos funcionários

Envie somente:

```text
Fryn-Setup.exe
```

O funcionário instala e abre. Não existe etapa de chave de API.

## 5. Controle das 12 vagas

Na primeira execução, cada instalação ocupa automaticamente uma vaga.

- Instalações 1 a 12: autorizadas.
- 13ª instalação: bloqueada.
- `Revogar`: bloqueia imediatamente o token daquele PC e libera capacidade para outra instalação.
- `Excluir/liberar`: apaga o registro e permite que aquele slot seja usado novamente.
- `Restaurar`: reativa um registro revogado se ainda houver capacidade.

## Modelo de IA

O desktop conhece apenas o nome lógico `Fryn AI` e o modelo lógico `assistant`. O backend usa uma cadeia free-first configurável por `FRYN_FREE_MODELS`; por padrão tenta North Mini Code free, Qwen3 Coder free e o roteador gratuito do OpenRouter. Se `FRYN_ENABLE_PAID_FALLBACK=true`, o Qwen3.7 Flash entra somente quando a cadeia gratuita não consegue atender. Tudo isso pode ser trocado no servidor sem recompilar o Fryn.

## Observação importante para uso empresarial

O código enviado ao assistente pode passar pelo backend Fryn e pelo provedor de inferência configurado. Antes de implantar em uma empresa, alinhe as regras internas de confidencialidade, código-fonte e dados permitidos para uso com IA.


## Roteamento free-first

Use no backend:

```env
FRYN_FREE_MODELS=cohere/north-mini-code:free,qwen/qwen3-coder:free,openrouter/free
FRYN_ENABLE_PAID_FALLBACK=true
FRYN_PAID_FALLBACK_MODEL=qwen/qwen3.7-flash
FRYN_DATA_COLLECTION=allow
FRYN_REQUIRE_ZDR=false
```

Para impedir qualquer gasto, altere `FRYN_ENABLE_PAID_FALLBACK=false`. Para código corporativo sensível, avalie `FRYN_DATA_COLLECTION=deny` e `FRYN_REQUIRE_ZDR=true`, sabendo que isso pode reduzir a disponibilidade dos endpoints gratuitos.
