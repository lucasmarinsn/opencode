import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app, utilityProcess } from "electron"
import type { Details } from "electron"
import { getLogger } from "./logging"
import { getUserShell, loadShellEnv } from "./shell-env"
import { getStore } from "./store"
import { DEFAULT_SERVER_URL_KEY } from "./store-keys"
import { ensureFrynLicense, readFrynAppConfig } from "./fryn-license"

export type HealthCheck = { wait: Promise<void> }

type SidecarMessage =
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

export type SidecarListener = { stop: () => Promise<void> }

const SIDECAR_SERVICE_NAME = "Fryn AI Service"
const SIDECAR_START_STALL_TIMEOUT = 60_000
const SIDECAR_STOP_TIMEOUT = 6_000

type SpawnLocalServerOptions = {
  userDataPath: string
  onStdout?: (message: string) => void
  onStderr?: (message: string) => void
  onExit?: (code: number) => void
}

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY)
}

export async function preferAppEnv(userDataPath: string) {
  const shell = process.platform === "win32" ? null : getUserShell()
  const shellEnv = shell ? loadShellEnv(shell, getLogger()) : null
  const appConfig = readFrynAppConfig()

  // Each desktop installation receives only a revocable Fryn license token.
  // The upstream AI credential and model remain exclusively on the Fryn backend.
  const license = await ensureFrynLicense().catch((error) => {
    getLogger().error("automatic Fryn activation failed", error)
    return undefined
  })

  const frynConfig = {
    autoupdate: false,
    share: "disabled",
    model: "fryn/assistant",
    small_model: "fryn/assistant",
    default_agent: "fryn",
    compaction: {
      auto: true,
      prune: true,
      reserved: 100000,
      tail_turns: 2,
      preserve_recent_tokens: 8000,
    },
    agent: {
      fryn: {
        name: "Fryn",
        mode: "primary",
        model: "fryn/assistant",
        color: "primary",
        description: "Assistente geral do Fryn para perguntas, documentos, imagens, e tarefas do dia a dia.",
        prompt:
          "Você é o Fryn, assistente privado de trabalho da empresa. Responda em português claro, com objetividade e cuidado. Ajude com documentos, imagens, e-mails, reuniões, decisões e próximos passos. Quando faltar informação importante, faça perguntas curtas. Não exponha detalhes técnicos de provedores, modelos ou infraestrutura para o usuário final.",
      },
      "fryn-office": {
        name: "Fryn Office",
        mode: "primary",
        model: "fryn/assistant",
        color: "accent",
        description: "E-mails, reuniões, agenda, follow-ups e comunicação corporativa.",
        prompt:
          "Você é o Fryn Office. Ajude com e-mails, reuniões, agenda, atas, follow-ups e comunicação profissional. Seja prático, educado e direto. Ao usar Outlook, confirme destinatários, horários, assunto e conteúdo antes de enviar ou criar algo que afete outra pessoa.",
      },
      "fryn-documentos": {
        name: "Fryn Documentos",
        mode: "primary",
        model: "fryn/assistant",
        color: "info",
        description: "Resumo, revisão e extração de pontos importantes de PDFs e documentos.",
        prompt:
          "Você é o Fryn Documentos. Analise PDFs, contratos, propostas, relatórios e textos longos. Priorize resumo executivo, riscos, pontos de atenção, decisões necessárias e próximos passos. Quando o documento for sensível, seja conservador e não invente informações que não estejam no material.",
      },
      "fryn-imagens": {
        name: "Fryn Imagens",
        mode: "primary",
        model: "fryn/assistant",
        color: "secondary",
        description: "Análise de prints, imagens, telas de erro e documentos visuais.",
        prompt:
          "Você é o Fryn Imagens. Explique imagens, prints, telas de sistema, mensagens de erro e documentos visuais. Diga primeiro o que aparece, depois o que isso significa e, quando fizer sentido, recomende o próximo passo.",
      },
      "fryn-comercial": {
        name: "Fryn Comercial",
        mode: "primary",
        model: "fryn/assistant",
        color: "success",
        description: "Mensagens para clientes, propostas, negociações e respostas comerciais.",
        prompt:
          "Você é o Fryn Comercial. Ajude a responder clientes, criar propostas, melhorar mensagens, preparar argumentos e organizar oportunidades. Mantenha tom profissional, claro e convincente, sem prometer prazos, preços ou condições que o usuário não tenha informado.",
      },
      "fryn-suporte": {
        name: "Fryn Suporte",
        mode: "primary",
        model: "fryn/assistant",
        color: "warning",
        description: "Diagnóstico de problemas, passo a passo e explicação de erros.",
        prompt:
          "Você é o Fryn Suporte. Ajude a diagnosticar problemas, explicar erros, montar passo a passo e orientar usuários internos. Seja paciente, simples e operacional. Peça prints, mensagens de erro ou contexto quando necessário.",
      },
    },
    provider: {
      fryn: {
        name: "Fryn AI",
        env: ["FRYN_LICENSE_TOKEN"],
        npm: "@ai-sdk/openai-compatible",
        options: {
          name: "Fryn AI",
          baseURL: license ? `${license.backendUrl}/v1` : "http://127.0.0.1:1/v1",
          headers: { "X-Fryn-Client": "desktop" },
        },
        models: {
          assistant: {
            id: "assistant",
            name: "Fryn AI",
            family: "fryn",
            reasoning: true,
            temperature: true,
            tool_call: true,
            cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
            limit: { context: 1048576, input: 900000, output: 65536 },
            modalities: { input: ["text", "image", "pdf"], output: ["text"] },
            capabilities: { tools: true, input: ["text", "image", "pdf"], output: ["text"] },
          },
        },
      },
    },
  }

  Object.assign(process.env, {
    ...shellEnv,
    ...(license
      ? { FRYN_LICENSE_TOKEN: license.token, FRYN_BACKEND_URL: license.backendUrl }
      : { FRYN_LICENSE_ERROR: "1" }),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(frynConfig),
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
    ...(appConfig.microsoft?.clientId ? { FRYN_MICROSOFT_CLIENT_ID: appConfig.microsoft.clientId } : {}),
    FRYN_MICROSOFT_TENANT: appConfig.microsoft?.tenant ?? "common",
    XDG_STATE_HOME: process.env.XDG_STATE_HOME ?? userDataPath,
  })
  return shellEnv
}

export async function spawnLocalServer(
  hostname: string,
  port: number,
  password: string,
  options: SpawnLocalServerOptions,
) {
  const sidecar = join(dirname(fileURLToPath(import.meta.url)), "sidecar.js")
  const child = utilityProcess.fork(sidecar, [], {
    cwd: process.cwd(),
    env: createSidecarEnv(),
    serviceName: SIDECAR_SERVICE_NAME,
    stdio: "pipe",
  })
  let exited = false
  const exit = defer<number>()

  const onProcessGone = (_event: unknown, details: Details) => {
    if (details.type !== "Utility" || details.name !== SIDECAR_SERVICE_NAME) return
    options.onStderr?.(`utility process gone reason=${details.reason} exitCode=${details.exitCode}`)
  }

  app.on("child-process-gone", onProcessGone)
  child.once("exit", (code) => {
    exited = true
    app.off("child-process-gone", onProcessGone)
    options.onExit?.(code)
    exit.resolve(code)
  })
  child.on("error", (error) => options.onStderr?.(`utility process error: ${serializeError(error).message}`))

  child.stdout?.on("data", (chunk: Buffer) => options.onStdout?.(chunk.toString("utf8").trimEnd()))
  child.stderr?.on("data", (chunk: Buffer) => options.onStderr?.(chunk.toString("utf8").trimEnd()))

  await new Promise<void>((resolve, reject) => {
    let done = false
    let timeout: NodeJS.Timeout

    const fail = (error: Error) => {
      if (done) return
      done = true
      cleanup()
      reject(error)
    }

    const refreshTimeout = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        fail(new Error(`Sidecar did not become ready within ${SIDECAR_START_STALL_TIMEOUT}ms: ${sidecar}`))
      }, SIDECAR_START_STALL_TIMEOUT)
    }

    const onMessage = (message: SidecarMessage) => {
      if (message.type === "ready") {
        if (done) return
        done = true
        cleanup()
        resolve()
        return
      }
      if (message.type === "error") {
        fail(Object.assign(new Error(message.error.message), { stack: message.error.stack }))
      }
    }
    const onExit = (code: number) => {
      fail(new Error(`Sidecar exited before ready with code ${code}`))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      child.off("message", onMessage)
      child.off("exit", onExit)
    }

    child.on("message", onMessage)
    child.on("exit", onExit)
    refreshTimeout()
    child.postMessage({
      type: "start",
      hostname,
      port,
      password,
      userDataPath: options.userDataPath,
    })
  }).catch((error) => {
    if (!exited) child.kill()
    throw error
  })

  const wait = (async () => {
    const url = `http://${hostname}:${port}`
    let healthy = false
    const gone = exit.promise.then((code) => {
      if (healthy) return
      throw new Error(`Sidecar exited before health check passed with code ${code}`)
    })

    const ready = async () => {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (await checkHealth(url, password)) {
          healthy = true
          return
        }
      }
    }

    await Promise.race([ready(), gone])
  })()

  let stopping: Promise<void> | undefined

  return {
    listener: {
      stop: () => {
        if (stopping) return stopping
        if (exited) return Promise.resolve()
        child.postMessage({ type: "stop" })
        stopping = Promise.race([
          exit.promise.then(() => undefined),
          delay(SIDECAR_STOP_TIMEOUT).then(() => {
            if (!exited) child.kill()
          }),
        ])
        return stopping
      },
    },
    health: { wait },
  }
}

export async function checkHealth(url: string, password?: string | null): Promise<boolean> {
  let healthUrls: URL[]
  try {
    healthUrls = [new URL("/api/health", url), new URL("/global/health", url)]
  } catch {
    return false
  }

  const headers = new Headers()
  if (password) {
    const auth = Buffer.from(`opencode:${password}`).toString("base64")
    headers.set("authorization", `Basic ${auth}`)
  }

  for (const healthUrl of healthUrls) {
    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return true
    } catch {}
  }
  return false
}

function createSidecarEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  )
  delete env.DEBUG
  if (process.platform === "linux") delete env.LD_PRELOAD
  return env
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
