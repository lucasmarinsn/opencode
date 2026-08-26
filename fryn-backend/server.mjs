import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { hostname } from "node:os"
import { join, resolve } from "node:path"

const PORT = integerEnv("PORT", 8787, 1, 65535)
const MAX_LICENSES = integerEnv("FRYN_MAX_LICENSES", 12, 1, 1000)
const REQUESTS_PER_MINUTE = integerEnv("FRYN_REQUESTS_PER_MINUTE", 30, 1, 10000)
const MAX_BODY_BYTES = integerEnv("FRYN_MAX_BODY_MB", 50, 1, 500) * 1024 * 1024
const UPSTREAM_TIMEOUT_MS = integerEnv("FRYN_UPSTREAM_TIMEOUT_SECONDS", 45, 5, 600) * 1000
const UPSTREAM_RETRIES = integerEnv("FRYN_UPSTREAM_RETRIES", 2, 0, 5)
const UPSTREAM_RETRY_DELAY_MS = integerEnv("FRYN_UPSTREAM_RETRY_DELAY_MS", 1200, 100, 10000)
const DATA_DIR = resolve(process.env.FRYN_DATA_DIR || "./data")
const DB_PATH = join(DATA_DIR, "licenses.json")
const ADMIN_TOKEN = requiredEnv("FRYN_ADMIN_TOKEN")
const UPSTREAM_PROVIDER = (process.env.FRYN_UPSTREAM_PROVIDER || "mimo").trim().toLowerCase()
const UPSTREAM_BASE_URL = normalizeBaseUrl(
  process.env.FRYN_UPSTREAM_BASE_URL ||
    (UPSTREAM_PROVIDER === "mimo" ? process.env.MIMO_BASE_URL : undefined) ||
    "https://token-plan-sgp.xiaomimimo.com/v1",
)
const UPSTREAM_API_KEY =
  UPSTREAM_PROVIDER === "mimo"
    ? requiredEnv("MIMO_API_KEY")
    : process.env.OPENCODE_API_KEY?.trim() || process.env.FRYN_UPSTREAM_API_KEY?.trim() || "public"
const UPSTREAM_TEXT_MODEL =
  process.env.FRYN_UPSTREAM_TEXT_MODEL ||
  (UPSTREAM_PROVIDER === "mimo" ? process.env.MIMO_TEXT_MODEL || "mimo-v2.5" : "gpt-5-nano")
const UPSTREAM_MULTIMODAL_MODEL =
  process.env.FRYN_UPSTREAM_MULTIMODAL_MODEL ||
  (UPSTREAM_PROVIDER === "mimo" ? process.env.MIMO_MULTIMODAL_MODEL || "mimo-v2.5" : UPSTREAM_TEXT_MODEL)
const CODEX_MIMO_BASE_URL = normalizeBaseUrl(process.env.FRYN_CODEX_MIMO_BASE_URL || "https://api.xiaomimimo.com/v1")
const CODEX_MIMO_MODEL = process.env.FRYN_CODEX_MIMO_MODEL || "mimo-v2.5"
const CODEX_LOGICAL_MODEL = "fryn-oee"
const DEFAULT_MAX_COMPLETION_TOKENS = integerEnv("FRYN_MAX_COMPLETION_TOKENS", 4096, 256, 32768)
const LOGICAL_MODELS = [
  {
    id: "assistant",
    name: "Fryn AI",
    provider: UPSTREAM_PROVIDER === "mimo" ? "xiaomi-mimo" : "opencode-free",
    model: UPSTREAM_TEXT_MODEL,
    multimodalModel: UPSTREAM_MULTIMODAL_MODEL,
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    capabilities: { tools: false, input: ["text", "image", "pdf"], output: ["text"] },
  },
]
const DEFAULT_LOGICAL_MODEL = "assistant"
const LEGACY_LOGICAL_MODELS = new Set(["assistant", "fryn-code", "fryn-fast", "fryn-expert", "fryn-plan", "fryn-vision"])
const KNOWN_MODELS = Array.from(new Set(LOGICAL_MODELS.flatMap((item) => [item.model, item.multimodalModel].filter(Boolean))))
const UPSTREAM_PROVIDER_LABEL = UPSTREAM_PROVIDER === "mimo" ? "Xiaomi MiMo" : "OpenCode Zen Free"

const rateWindows = new Map()
const routeMetrics = new Map(LOGICAL_MODELS.map((item) => [item.id, { requests: 0, successes: 0, failures: 0, totalLatencyMs: 0, lastLatencyMs: 0, lastStatus: null }]))
let writeChain = Promise.resolve()
let state = await loadState()

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`[Fryn] Variavel obrigatoria ausente: ${name}`)
    process.exit(1)
  }
  return value
}

function integerEnv(name, fallback, min, max) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < min || value > max) {
    console.error(`[Fryn] ${name} deve ser um inteiro entre ${min} e ${max}.`)
    process.exit(1)
  }
  return value
}

function normalizeBaseUrl(value) {
  const url = new URL(value)
  if (!/^https?:$/.test(url.protocol)) throw new Error("FRYN_UPSTREAM_BASE_URL precisa usar http ou https")
  return url.toString().replace(/\/$/, "")
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanText(value, max = 160) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : ""
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex")
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

function newLicenseToken() {
  return `fryn_${randomBytes(32).toString("base64url")}`
}

function activeLicenses() {
  return state.licenses.filter((license) => license.status === "active")
}

function nextSlot() {
  const used = new Set(activeLicenses().map((license) => license.slot))
  for (let slot = 1; slot <= MAX_LICENSES; slot++) if (!used.has(slot)) return slot
  return null
}

async function loadState() {
  await mkdir(DATA_DIR, { recursive: true })
  try {
    const parsed = JSON.parse(await readFile(DB_PATH, "utf8"))
    if (parsed?.version === 1 && Array.isArray(parsed.licenses)) return parsed
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn("[Fryn] Banco de licencas invalido; criando novo.")
  }
  const initial = { version: 1, licenses: [] }
  await persistState(initial)
  return initial
}

async function persistState(nextState = state) {
  const snapshot = JSON.stringify(nextState, null, 2)
  writeChain = writeChain.then(async () => {
    const temp = `${DB_PATH}.tmp`
    await writeFile(temp, snapshot, { mode: 0o600 })
    await rename(temp, DB_PATH)
  })
  return writeChain
}

function json(res, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": data.length,
    "cache-control": "no-store",
    ...headers,
  })
  res.end(data)
}

function text(res, status, body, type = "text/plain; charset=utf-8") {
  const data = Buffer.from(body)
  res.writeHead(status, {
    "content-type": type,
    "content-length": data.length,
    "cache-control": "no-store",
  })
  res.end(data)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      const error = new Error("request_too_large")
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const raw = await readBody(req)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString("utf8"))
  } catch {
    const error = new Error("invalid_json")
    error.status = 400
    throw error
  }
}

function bearer(req) {
  const value = req.headers.authorization || ""
  const match = /^Bearer\s+(.+)$/i.exec(value)
  return match?.[1]?.trim() || ""
}

function adminAuthorized(req) {
  const provided = req.headers["x-admin-token"] || bearer(req)
  return typeof provided === "string" && safeEqual(provided, ADMIN_TOKEN)
}

function licenseFromRequest(req) {
  const token = bearer(req)
  if (!token) return null
  const tokenHash = hashToken(token)
  const license = state.licenses.find((item) => item.tokenHash === tokenHash)
  if (!license || license.status !== "active") return null
  return license
}

function rateAllowed(license) {
  const now = Date.now()
  const key = license.id
  const recent = (rateWindows.get(key) || []).filter((time) => now - time < 60_000)
  if (recent.length >= REQUESTS_PER_MINUTE) {
    rateWindows.set(key, recent)
    return false
  }
  recent.push(now)
  rateWindows.set(key, recent)
  return true
}

function codexRateAllowed(apiKey) {
  return rateAllowed({ id: `codex:${hashToken(apiKey)}` })
}

function publicLicense(license) {
  return {
    id: license.id,
    slot: license.slot,
    status: license.status,
    deviceName: license.deviceName,
    platform: license.platform,
    appVersion: license.appVersion,
    createdAt: license.createdAt,
    lastSeenAt: license.lastSeenAt,
    revokedAt: license.revokedAt || null,
  }
}

async function activate(req, res) {
  const body = await readJson(req)
  const id = cleanText(body.installationId, 96)
  if (!/^[A-Za-z0-9_-]{16,96}$/.test(id)) return json(res, 400, { error: "invalid_installation" })

  let license = state.licenses.find((item) => item.id === id)
  if (license?.status === "revoked") return json(res, 403, { error: "license_revoked" })

  if (!license) {
    const slot = nextSlot()
    if (!slot) return json(res, 403, { error: "license_limit", max: MAX_LICENSES })
    license = {
      id,
      slot,
      status: "active",
      tokenHash: "",
      deviceName: cleanText(body.deviceName, 120) || `Fryn PC ${slot}`,
      platform: cleanText(body.platform, 80),
      appVersion: cleanText(body.appVersion, 40),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    }
    state.licenses.push(license)
  }

  license.deviceName = cleanText(body.deviceName, 120) || license.deviceName
  license.platform = cleanText(body.platform, 80) || license.platform
  license.appVersion = cleanText(body.appVersion, 40) || license.appVersion
  license.lastSeenAt = new Date().toISOString()

  const token = newLicenseToken()
  license.tokenHash = hashToken(token)
  await persistState()
  return json(res, 200, { token, slot: license.slot, max: MAX_LICENSES })
}

async function status(req, res) {
  const license = licenseFromRequest(req)
  if (!license) return json(res, 401, { error: "not_authorized" })
  license.lastSeenAt = new Date().toISOString()
  await persistState()
  return json(res, 200, { active: true, slot: license.slot, max: MAX_LICENSES })
}

function sanitizeUpstream(value) {
  let text = String(value)
  for (const model of KNOWN_MODELS) text = text.replaceAll(model, "Fryn AI")
  return text
    .replace(/cohere\/north-mini-code(?::free)?/gi, "Fryn AI")
    .replace(/qwen\/[A-Za-z0-9_.:-]+/gi, "Fryn AI")
    .replace(/openrouter\/free/gi, "Fryn AI")
    .replace(/poolside\/[A-Za-z0-9_.:-]+/gi, "Fryn AI")
    .replace(/nvidia\/[A-Za-z0-9_.:-]+/gi, "Fryn AI")
    .replace(/openai\/gpt-oss-[A-Za-z0-9_.:-]+/gi, "Fryn AI")
    .replace(/gemini-[A-Za-z0-9_.:-]+/gi, "Fryn AI")
    .replace(/mimo(?:-v)?[A-Za-z0-9_.:-]*/gi, "Fryn AI")
    .replace(/xiaomi(?:mimo)?/gi, "Fryn AI")
    .replace(/north-mini-code-free/gi, "Fryn AI")
    .replace(/north[ -]?mini[ -]?code/gi, "Fryn AI")
    .replace(/qwen(?:3(?:\.[0-9]+)?(?:[ -]?(?:coder|flash|plus))?)?/gi, "Fryn AI")
    .replace(/cohere/gi, "Fryn")
    .replace(/openrouter(?:\.ai)?/gi, "Fryn AI")
    .replace(/opencode(?: zen)?/gi, "Fryn AI")
}

function hasMultimodalInput(value) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") {
    const text = value.toLowerCase()
    return text.startsWith("data:image/") || text.startsWith("data:application/pdf") || text.endsWith(".pdf")
  }
  if (Array.isArray(value)) return value.some(hasMultimodalInput)
  if (typeof value !== "object") return false

  for (const [key, raw] of Object.entries(value)) {
    const name = key.toLowerCase()
    if (typeof raw === "string") {
      const text = raw.toLowerCase()
      if ((name === "type" || name === "media_type") && /image|pdf|input_image|image_url/.test(text)) return true
      if ((name === "mime" || name === "content_type") && /image\/|application\/pdf/.test(text)) return true
      if (name === "url" && (text.startsWith("data:image/") || text.startsWith("data:application/pdf") || text.endsWith(".pdf"))) return true
    }
    if (hasMultimodalInput(raw)) return true
  }
  return false
}

function codexApiKey(req) {
  const apiKey = bearer(req)
  return /^sk-[A-Za-z0-9_-]{8,}$/.test(apiKey) ? apiKey : ""
}

function contentText(value) {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

function responsesContentToChat(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return contentText(content)

  const parts = []
  for (const part of content) {
    if (typeof part === "string") {
      parts.push({ type: "text", text: part })
      continue
    }
    if (!part || typeof part !== "object") continue
    if (["input_text", "output_text", "text"].includes(part.type)) {
      parts.push({ type: "text", text: contentText(part.text) })
      continue
    }
    if (["input_image", "image_url"].includes(part.type)) {
      const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url || part.url
      if (url) parts.push({ type: "image_url", image_url: { url } })
      continue
    }
    if (part.type === "input_file") {
      const fileText = part.file_data || part.file_url || part.filename
      if (fileText) parts.push({ type: "text", text: `[Arquivo fornecido: ${contentText(fileText)}]` })
    }
  }
  if (!parts.length) return ""
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text
  return parts
}

function responsesInputToMessages(body) {
  const messages = []
  if (body.instructions) messages.push({ role: "system", content: contentText(body.instructions) })

  const input = typeof body.input === "string" ? [{ type: "message", role: "user", content: body.input }] : body.input
  if (!Array.isArray(input)) return messages

  let pendingToolCalls = []
  const flushToolCalls = () => {
    if (!pendingToolCalls.length) return
    messages.push({ role: "assistant", content: null, tool_calls: pendingToolCalls })
    pendingToolCalls = []
  }

  for (const item of input) {
    if (typeof item === "string") {
      flushToolCalls()
      messages.push({ role: "user", content: item })
      continue
    }
    if (!item || typeof item !== "object") continue

    if (item.type === "function_call") {
      pendingToolCalls.push({
        id: item.call_id || item.id || `call_${randomBytes(8).toString("hex")}`,
        type: "function",
        function: { name: item.name, arguments: contentText(item.arguments || "{}") },
      })
      continue
    }

    flushToolCalls()
    if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: contentText(item.output),
      })
      continue
    }
    if (item.type === "message" || item.role) {
      messages.push({
        role: item.role === "developer" ? "system" : item.role || "user",
        content: responsesContentToChat(item.content),
      })
      continue
    }
    if (["input_text", "input_image", "image_url"].includes(item.type)) {
      messages.push({ role: "user", content: responsesContentToChat([item]) })
    }
  }
  flushToolCalls()
  return messages
}

function responsesToolsToChat(tools) {
  if (!Array.isArray(tools)) return undefined
  const mapped = tools
    .filter((tool) => tool?.type === "function" && tool.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        parameters: tool.parameters || { type: "object", properties: {} },
        ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
      },
    }))
  return mapped.length ? mapped : undefined
}

function responsesToolChoiceToChat(choice) {
  if (!choice || typeof choice === "string") return choice
  if (choice.type === "function" && choice.name) return { type: "function", function: { name: choice.name } }
  return undefined
}

function responseIds() {
  const suffix = randomBytes(12).toString("hex")
  return { response: `resp_${suffix}`, message: `msg_${suffix}` }
}

function chatCompletionToResponse(completion) {
  const ids = responseIds()
  const message = completion?.choices?.[0]?.message || {}
  const output = []
  if (typeof message.content === "string" && message.content) {
    output.push({
      id: ids.message,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: message.content, annotations: [] }],
    })
  }
  for (const [index, call] of (message.tool_calls || []).entries()) {
    output.push({
      id: `fc_${randomBytes(12).toString("hex")}`,
      type: "function_call",
      status: "completed",
      call_id: call.id || `call_${index}_${randomBytes(8).toString("hex")}`,
      name: call.function?.name || "tool",
      arguments: contentText(call.function?.arguments || "{}"),
    })
  }
  const usage = completion?.usage || {}
  return {
    id: ids.response,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    error: null,
    incomplete_details: null,
    model: CODEX_LOGICAL_MODEL,
    output,
    parallel_tool_calls: true,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
  }
}

function sendResponseEvents(res, response) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  })
  let sequence = 0
  const send = (type, payload) => {
    const event = { type, sequence_number: sequence++, ...payload }
    res.write(`event: ${type}\ndata: ${JSON.stringify(event)}\n\n`)
  }

  send("response.created", { response: { ...response, status: "in_progress", output: [] } })
  response.output.forEach((item, outputIndex) => {
    send("response.output_item.added", { output_index: outputIndex, item: { ...item, status: "in_progress" } })
    if (item.type === "message") {
      const part = item.content[0]
      send("response.content_part.added", { item_id: item.id, output_index: outputIndex, content_index: 0, part: { ...part, text: "" } })
      send("response.output_text.delta", { item_id: item.id, output_index: outputIndex, content_index: 0, delta: part.text })
      send("response.output_text.done", { item_id: item.id, output_index: outputIndex, content_index: 0, text: part.text })
      send("response.content_part.done", { item_id: item.id, output_index: outputIndex, content_index: 0, part })
    } else if (item.type === "function_call") {
      send("response.function_call_arguments.delta", { item_id: item.id, output_index: outputIndex, delta: item.arguments })
      send("response.function_call_arguments.done", { item_id: item.id, output_index: outputIndex, arguments: item.arguments })
    }
    send("response.output_item.done", { output_index: outputIndex, item })
  })
  send("response.completed", { response })
  res.end("data: [DONE]\n\n")
}

function normalizeFrynChatCompletion(completion) {
  let normalized
  try {
    normalized = JSON.parse(sanitizeUpstream(JSON.stringify(completion)))
  } catch {
    normalized = completion
  }
  return { ...normalized, model: CODEX_LOGICAL_MODEL }
}

function sendChatCompletionEvents(res, completion) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  })
  const choice = completion?.choices?.[0] || {}
  const message = choice.message || {}
  const base = {
    id: completion.id || `chatcmpl_${randomBytes(12).toString("hex")}`,
    object: "chat.completion.chunk",
    created: completion.created || Math.floor(Date.now() / 1000),
    model: CODEX_LOGICAL_MODEL,
  }
  const send = (delta, finishReason = null) => {
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`)
  }
  send({ role: "assistant", ...(message.content ? { content: message.content } : {}) })
  if (message.tool_calls?.length) {
    send({
      tool_calls: message.tool_calls.map((call, index) => ({
        index,
        id: call.id,
        type: "function",
        function: { name: call.function?.name, arguments: contentText(call.function?.arguments || "{}") },
      })),
    })
  }
  send({}, choice.finish_reason || (message.tool_calls?.length ? "tool_calls" : "stop"))
  res.end("data: [DONE]\n\n")
}

async function frynChatCompletions(res, apiKey, body) {
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return json(res, 400, { error: { message: "A solicitacao nao contem mensagens.", type: "invalid_request_error" } })
  }
  const wantsStream = body.stream === true
  const upstreamBody = { ...body, model: CODEX_MIMO_MODEL, stream: false }
  delete upstreamBody.models
  delete upstreamBody.provider

  let upstreamResponse
  try {
    upstreamResponse = await fetch(`${CODEX_MIMO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (error) {
    console.error("[Fryn API] Upstream indisponivel:", error?.message || error)
    return json(res, 502, { error: { message: "O Fryn ficou indisponivel por alguns segundos.", type: "api_error" } })
  }

  const raw = await upstreamResponse.text()
  if (!upstreamResponse.ok) {
    let detail = "A solicitacao foi recusada pelo provedor do Fryn."
    try {
      const parsed = JSON.parse(raw)
      detail = parsed?.error?.message || parsed?.message || detail
    } catch {}
    return json(res, upstreamResponse.status, { error: { message: sanitizeUpstream(detail), type: "upstream_error" } })
  }

  let completion
  try {
    completion = normalizeFrynChatCompletion(JSON.parse(raw))
  } catch {
    return json(res, 502, { error: { message: "O Fryn recebeu uma resposta invalida.", type: "api_error" } })
  }
  return wantsStream ? sendChatCompletionEvents(res, completion) : json(res, 200, completion)
}

async function codexGateway(req, res, path) {
  const apiKey = codexApiKey(req)
  if (!apiKey) return json(res, 401, { error: { message: "Chave MiMo invalida ou ausente.", type: "authentication_error" } })
  if (!codexRateAllowed(apiKey)) return json(res, 429, { error: { message: "Muitas solicitacoes. Tente novamente em instantes.", type: "rate_limit_error" } })

  const gatewayPath = path.replace(/^\/(?:codex|fryn)\/v1/, "")

  if (req.method === "GET" && gatewayPath === "/models") {
    return json(res, 200, {
      object: "list",
      data: [{ id: CODEX_LOGICAL_MODEL, object: "model", created: 0, owned_by: "fryn" }],
    })
  }
  if (req.method !== "POST" || !["/responses", "/chat/completions"].includes(gatewayPath)) {
    return json(res, req.method === "POST" ? 404 : 405, { error: { message: "Rota nao encontrada.", type: "invalid_request_error" } })
  }

  const body = await readJson(req)
  if (body.model && body.model !== CODEX_LOGICAL_MODEL) {
    return json(res, 400, { error: { message: `Use o modelo ${CODEX_LOGICAL_MODEL}.`, type: "invalid_request_error" } })
  }
  if (gatewayPath === "/chat/completions") return frynChatCompletions(res, apiKey, body)
  const messages = responsesInputToMessages(body)
  if (!messages.length) return json(res, 400, { error: { message: "A solicitacao nao contem mensagens.", type: "invalid_request_error" } })

  const tools = responsesToolsToChat(body.tools)
  const toolChoice = responsesToolChoiceToChat(body.tool_choice)
  const upstreamBody = {
    model: CODEX_MIMO_MODEL,
    messages,
    stream: false,
    max_completion_tokens: body.max_output_tokens || DEFAULT_MAX_COMPLETION_TOKENS,
    ...(tools ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(body.parallel_tool_calls !== undefined ? { parallel_tool_calls: body.parallel_tool_calls } : {}),
  }

  let upstreamResponse
  try {
    upstreamResponse = await fetch(`${CODEX_MIMO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (error) {
    console.error("[Fryn Codex] Upstream indisponivel:", error?.message || error)
    return json(res, 502, { error: { message: "O Fryn ficou indisponivel por alguns segundos.", type: "api_error" } })
  }

  const raw = await upstreamResponse.text()
  if (!upstreamResponse.ok) {
    let detail = "A solicitacao foi recusada pelo provedor do Fryn."
    try {
      const parsed = JSON.parse(raw)
      detail = parsed?.error?.message || parsed?.message || detail
    } catch {}
    return json(res, upstreamResponse.status, { error: { message: sanitizeUpstream(detail), type: "upstream_error" } })
  }

  let completion
  try {
    completion = JSON.parse(raw)
  } catch {
    return json(res, 502, { error: { message: "O Fryn recebeu uma resposta invalida.", type: "api_error" } })
  }
  const response = chatCompletionToResponse(completion)
  return body.stream ? sendResponseEvents(res, response) : json(res, 200, response)
}

async function proxyAI(req, res, path) {
  const license = licenseFromRequest(req)
  if (!license) return json(res, 401, { error: "Fryn nao autorizado." })
  if (!rateAllowed(license)) return json(res, 429, { error: "Fryn temporariamente ocupado. Tente novamente em instantes." })

  if (req.method === "GET" && path === "/v1/models") {
    return json(res, 200, {
      object: "list",
      data: LOGICAL_MODELS.map((item) => ({
        id: item.id,
        name: item.name,
        object: "model",
        owned_by: "fryn",
        modalities: item.modalities,
        capabilities: item.capabilities,
      })),
    })
  }

  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" })
  const raw = await readBody(req)
  let body
  try {
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {}
  } catch {
    return json(res, 400, { error: "invalid_request" })
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(res, 400, { error: "invalid_request" })
  const upstreamPath = path.slice(3) || "/chat/completions"
  const requestedModel = LEGACY_LOGICAL_MODELS.has(body.model || DEFAULT_LOGICAL_MODEL)
    ? DEFAULT_LOGICAL_MODEL
    : body.model
  const route = LOGICAL_MODELS.find((item) => item.id === requestedModel)
  if (!route) return json(res, 400, { error: "Modelo Fryn invalido." })
  const target = `${UPSTREAM_BASE_URL}${upstreamPath}`
  const startedAt = Date.now()
  const metric = routeMetrics.get(route.id)
  metric.requests++
  const attempts = []
  const upstreamModel = hasMultimodalInput(body) ? route.multimodalModel : route.model
  const attemptBody = { ...body, model: upstreamModel }
  delete attemptBody.models
  delete attemptBody.provider
  if (attemptBody.max_completion_tokens === undefined && attemptBody.max_tokens === undefined) {
    attemptBody.max_completion_tokens = DEFAULT_MAX_COMPLETION_TOKENS
  }
  for (let retry = 0; retry <= UPSTREAM_RETRIES; retry++) {
    attempts.push({
      kind: retry === 0 ? route.id : `${route.id}:retry-${retry}`,
      body: attemptBody,
      apiKey: UPSTREAM_API_KEY,
    })
  }

  function retryableStatus(status, detail = "") {
    const retryableHttp = status === 404 || status === 408 || status === 409 || status === 429 || status === 502 || status === 503 || status === 504
    const retryableZenMessage = /model.+not.+support|not supported|unsupported|free usage|quota|rate.?limit|limit exceeded/i.test(detail)
    return retryableHttp || ((status === 400 || status === 402 || status === 403) && retryableZenMessage)
  }

  let upstreamResponse
  let upstreamErrorText = ""
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index]
    try {
      upstreamResponse = await fetch(attempt.target || target, {
        method: "POST",
        headers: {
          authorization: `Bearer ${attempt.apiKey}`,
          "content-type": "application/json",
          "x-title": "Fryn",
          ...(process.env.FRYN_HTTP_REFERER ? { "http-referer": process.env.FRYN_HTTP_REFERER } : {}),
        },
        body: JSON.stringify(attempt.body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
    } catch (error) {
      console.error(`[Fryn] Falha no upstream (${attempt.kind}):`, error?.message || error)
      if (index < attempts.length - 1) {
        await wait(UPSTREAM_RETRY_DELAY_MS)
        continue
      }
      metric.lastLatencyMs = Date.now() - startedAt
      metric.totalLatencyMs += metric.lastLatencyMs
      metric.lastStatus = 502
      metric.failures++
      return json(res, 502, { error: "O Fryn AI ficou indisponivel por alguns segundos. Tente novamente." })
    }

    if (upstreamResponse.ok) break
    upstreamErrorText = await upstreamResponse.text().catch(() => "")
    if (index === attempts.length - 1 || !retryableStatus(upstreamResponse.status, upstreamErrorText)) break
    console.warn(`[Fryn] Upstream instavel (HTTP ${upstreamResponse.status}); tentando novamente.`)
    upstreamResponse = undefined
    await wait(UPSTREAM_RETRY_DELAY_MS)
  }

  metric.lastLatencyMs = Date.now() - startedAt
  metric.totalLatencyMs += metric.lastLatencyMs
  metric.lastStatus = upstreamResponse?.status || 502
  if (!upstreamResponse) {
    metric.failures++
    return json(res, 502, { error: "O Fryn AI ficou indisponivel por alguns segundos. Tente novamente." })
  }
  if (upstreamResponse.ok) metric.successes++
  else metric.failures++

  license.lastSeenAt = new Date().toISOString()
  void persistState()

  const contentType = upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8"
  if (!upstreamResponse.ok && upstreamErrorText) {
    const sanitized = sanitizeUpstream(upstreamErrorText)
    res.writeHead(upstreamResponse.status, {
      "content-type": contentType,
      "cache-control": "no-store",
    })
    return res.end(sanitized)
  }

  res.writeHead(upstreamResponse.status, {
    "content-type": contentType,
    "cache-control": "no-store",
    ...(contentType.includes("text/event-stream") ? { connection: "keep-alive", "x-accel-buffering": "no" } : {}),
  })

  if (!upstreamResponse.body) return res.end()

  const reader = upstreamResponse.body.getReader()
  const decoder = new TextDecoder()
  const keep = 128
  let carry = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const textChunk = carry + decoder.decode(value, { stream: true })
      if (textChunk.length <= keep) {
        carry = textChunk
        continue
      }
      const splitAt = textChunk.length - keep
      res.write(sanitizeUpstream(textChunk.slice(0, splitAt)))
      carry = textChunk.slice(splitAt)
    }
    res.end(sanitizeUpstream(carry + decoder.decode()))
  } catch (error) {
    console.error("[Fryn] Erro durante streaming:", error?.message || error)
    res.end()
  }
}

async function adminApi(req, res, url) {
  if (!adminAuthorized(req)) return json(res, 401, { error: "not_authorized" })

  if (req.method === "GET" && url.pathname === "/admin/api/licenses") {
    return json(res, 200, {
      max: MAX_LICENSES,
      active: activeLicenses().length,
      licenses: state.licenses.slice().sort((a, b) => a.slot - b.slot).map(publicLicense),
    })
  }

  if (req.method === "GET" && url.pathname === "/admin/api/metrics") {
    return json(res, 200, {
      models: LOGICAL_MODELS.map((item) => {
        const metric = routeMetrics.get(item.id)
        return {
          id: item.id,
          name: item.name,
          requests: metric.requests,
          successes: metric.successes,
          failures: metric.failures,
          averageLatencyMs: metric.requests ? Math.round(metric.totalLatencyMs / metric.requests) : 0,
          lastLatencyMs: metric.lastLatencyMs,
          lastStatus: metric.lastStatus,
        }
      }),
    })
  }

  const match = /^\/admin\/api\/licenses\/([^/]+)\/(revoke|restore|delete)$/.exec(url.pathname)
  if (!match || req.method !== "POST") return json(res, 404, { error: "not_found" })

  const id = decodeURIComponent(match[1])
  const action = match[2]
  const index = state.licenses.findIndex((item) => item.id === id)
  if (index === -1) return json(res, 404, { error: "license_not_found" })
  const license = state.licenses[index]

  if (action === "delete") {
    state.licenses.splice(index, 1)
    rateWindows.delete(id)
  } else if (action === "revoke") {
    license.status = "revoked"
    license.revokedAt = new Date().toISOString()
    license.tokenHash = ""
    rateWindows.delete(id)
  } else if (action === "restore") {
    if (license.status !== "active" && activeLicenses().length >= MAX_LICENSES) {
      return json(res, 409, { error: "license_limit", max: MAX_LICENSES })
    }
    license.status = "active"
    delete license.revokedAt
    license.tokenHash = ""
  }

  await persistState()
  return json(res, 200, { ok: true })
}

const ADMIN_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fryn Admin</title><style>
:root{font-family:Inter,system-ui,sans-serif;color-scheme:dark;background:#0d0b14;color:#f4f0ff}body{margin:0;padding:32px}.wrap{max-width:1050px;margin:auto}h1{margin:0 0 6px}.muted{color:#9b93ae}.card{background:#151220;border:1px solid #2b2540;border-radius:16px;padding:20px;margin-top:20px}.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}input{background:#0e0c15;color:#fff;border:1px solid #39304f;border-radius:10px;padding:11px 12px;min-width:340px}button{background:#7548ff;color:#fff;border:0;border-radius:9px;padding:9px 12px;cursor:pointer}button.secondary{background:#29233a}button.danger{background:#8f3247}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;padding:11px;border-bottom:1px solid #2a2439;font-size:14px}.badge{padding:4px 8px;border-radius:999px;background:#28213d}.active{color:#8ff0b5}.revoked{color:#ff9eae}.actions{display:flex;gap:6px}.error{color:#ff9eae;white-space:pre-wrap}</style></head>
<body><div class="wrap"><h1>Fryn Admin</h1><div class="muted">Controle das 12 instalacoes autorizadas.</div>
<div class="card"><div class="row"><input id="token" type="password" placeholder="Token administrativo"><button id="save">Entrar</button><button class="secondary" id="refresh">Atualizar</button><span id="summary" class="muted"></span></div><div id="error" class="error"></div></div>
<div class="card"><table><thead><tr><th>Vaga</th><th>Computador</th><th>Status</th><th>Versao</th><th>Ultimo uso</th><th>Acoes</th></tr></thead><tbody id="rows"></tbody></table></div></div>
<script>
const token=document.querySelector('#token'),rows=document.querySelector('#rows'),summary=document.querySelector('#summary'),err=document.querySelector('#error');token.value=localStorage.getItem('frynAdminToken')||'';
async function call(path,opts={}){const r=await fetch(path,{...opts,headers:{...(opts.headers||{}),'X-Admin-Token':token.value}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}
function td(text){const e=document.createElement('td');e.textContent=text??'';return e}
async function load(){err.textContent='';try{const d=await call('/admin/api/licenses');summary.textContent=d.active+' / '+d.max+' vagas em uso';rows.replaceChildren();for(const l of d.licenses){const tr=document.createElement('tr');tr.append(td('#'+l.slot),td(l.deviceName||l.id.slice(0,12)));const st=td(l.status);st.className=l.status;tr.append(st,td(l.appVersion||'-'),td(l.lastSeenAt?new Date(l.lastSeenAt).toLocaleString():'-'));const ac=td('');ac.className='actions';const rev=document.createElement('button');rev.textContent=l.status==='active'?'Revogar':'Restaurar';rev.className=l.status==='active'?'danger':'secondary';rev.onclick=()=>act(l.id,l.status==='active'?'revoke':'restore');const del=document.createElement('button');del.textContent='Excluir/liberar';del.className='secondary';del.onclick=()=>act(l.id,'delete');ac.append(rev,del);tr.append(ac);rows.append(tr)}}catch(e){err.textContent='Nao foi possivel carregar: '+e.message}}
async function act(id,action){if(action==='delete'&&!confirm('Excluir esta instalacao e liberar a vaga?'))return;try{await call('/admin/api/licenses/'+encodeURIComponent(id)+'/'+action,{method:'POST'});await load()}catch(e){err.textContent=e.message}}
document.querySelector('#save').onclick=()=>{localStorage.setItem('frynAdminToken',token.value);load()};document.querySelector('#refresh').onclick=load;if(token.value)load();
</script></body></html>`

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "Fryn",
        activeLicenses: activeLicenses().length,
        maxLicenses: MAX_LICENSES,
        routing: {
          mode: "direct",
          defaultModel: DEFAULT_LOGICAL_MODEL,
          models: LOGICAL_MODELS.map((item) => item.id),
          paidFallback: false,
          provider: UPSTREAM_PROVIDER_LABEL,
        },
      })
    }
    if (req.method === "GET" && url.pathname === "/admin") return text(res, 200, ADMIN_HTML, "text/html; charset=utf-8")
    if (url.pathname.startsWith("/admin/api/")) return await adminApi(req, res, url)
    if (req.method === "POST" && url.pathname === "/api/activate") return await activate(req, res)
    if (req.method === "GET" && url.pathname === "/api/license/status") return await status(req, res)
    if (/^\/(?:codex|fryn)\/v1\//.test(url.pathname)) return await codexGateway(req, res, url.pathname)
    if (url.pathname.startsWith("/v1/")) return await proxyAI(req, res, url.pathname)
    return json(res, 404, { error: "not_found" })
  } catch (error) {
    console.error("[Fryn] Erro:", error)
    return json(res, error?.status || 500, { error: error?.status ? error.message : "internal_error" })
  }
})

export { server }

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Fryn] Backend ativo em http://0.0.0.0:${PORT}`)
  console.log(`[Fryn] ${activeLicenses().length}/${MAX_LICENSES} instalacoes ativas | host ${hostname()}`)
  console.log(
    `[Fryn] Modelo unico ativo | ${LOGICAL_MODELS[0].id} | fallback pago desativado`,
  )
  console.log(`[Fryn] Provedor upstream: ${UPSTREAM_PROVIDER_LABEL} | ${LOGICAL_MODELS[0].model}`)
})
