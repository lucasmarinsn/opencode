import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { hostname, platform as osPlatform, release } from "node:os"
import { join } from "node:path"
import { app, safeStorage } from "electron"
import { getStore } from "./store"

const STORE = "fryn.license"
const INSTALLATION_ID_KEY = "installationId"
const LICENSE_TOKEN_KEY = "licenseToken"
const REQUEST_TIMEOUT_MS = 10_000

export type FrynAppConfig = {
  backendUrl?: string
  microsoft?: {
    clientId?: string
    tenant?: string
  }
}
type ActivationResponse = { token: string; slot: number; max: number }
type StatusResponse = { active: boolean; slot: number; max: number }

function normalizeUrl(value: string) {
  const url = new URL(value.trim())
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("URL do backend Fryn invalida.")
  return url.toString().replace(/\/$/, "")
}

export function getFrynBackendUrl() {
  const config = readFrynAppConfig()
  const env = process.env.FRYN_BACKEND_URL?.trim()
  if (env) return normalizeUrl(env)

  if (config.backendUrl) return normalizeUrl(config.backendUrl)
  throw new Error("Backend do Fryn nao configurado.")
}

export function readFrynAppConfig(): FrynAppConfig {
  const paths = app.isPackaged
    ? [join(process.resourcesPath, "fryn-backend.json")]
    : [join(app.getAppPath(), "fryn-backend.json"), join(process.cwd(), "fryn-backend.json")]

  for (const path of paths) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as FrynAppConfig
    } catch {}
  }

  return {}
}

function installationId() {
  const store = getStore(STORE)
  const current = store.get(INSTALLATION_ID_KEY)
  if (typeof current === "string" && current.length >= 16) return current
  const next = `install_${randomUUID().replaceAll("-", "")}`
  store.set(INSTALLATION_ID_KEY, next)
  return next
}

function readToken() {
  const stored = getStore(STORE).get(LICENSE_TOKEN_KEY)
  if (typeof stored !== "string" || !stored) return undefined
  if (stored.startsWith("enc:")) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), "base64")) || undefined
    } catch {
      return undefined
    }
  }
  if (stored.startsWith("plain:")) return stored.slice(6) || undefined
  return undefined
}

function saveToken(token: string) {
  const value = safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(token).toString("base64")}`
    : `plain:${token}`
  getStore(STORE).set(LICENSE_TOKEN_KEY, value)
}

function clearToken() {
  getStore(STORE).delete(LICENSE_TOKEN_KEY)
}

async function request(url: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function checkExisting(backendUrl: string, token: string): Promise<StatusResponse | undefined> {
  const response = await request(`${backendUrl}/api/license/status`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, "x-fryn-client": "desktop" },
  })
  if (response.status === 401) return undefined
  if (!response.ok) throw new Error("Nao foi possivel validar a licenca do Fryn.")
  return (await response.json()) as StatusResponse
}

async function activate(backendUrl: string): Promise<ActivationResponse> {
  const response = await request(`${backendUrl}/api/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fryn-client": "desktop" },
    body: JSON.stringify({
      installationId: installationId(),
      deviceName: hostname(),
      platform: `${osPlatform()} ${release()}`,
      appVersion: app.getVersion(),
    }),
  })

  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; max?: number }
    if (body.error === "license_limit") throw new Error(`O limite de ${body.max ?? 12} instalacoes do Fryn foi atingido.`)
    if (body.error === "license_revoked") throw new Error("Esta instalacao do Fryn foi revogada pelo administrador.")
  }
  if (!response.ok) throw new Error("Nao foi possivel ativar o Fryn automaticamente.")
  return (await response.json()) as ActivationResponse
}

export async function ensureFrynLicense() {
  const backendUrl = getFrynBackendUrl()

  const injected = process.env.FRYN_LICENSE_TOKEN?.trim()
  if (injected) return { token: injected, backendUrl, slot: 0, max: 12 }

  const current = readToken()
  if (current) {
    try {
      const status = await checkExisting(backendUrl, current)
      if (status?.active) return { token: current, backendUrl, slot: status.slot, max: status.max }
      clearToken()
    } catch (error) {
      // If the backend is temporarily unreachable, keep the token on disk so a later restart can retry.
      throw error
    }
  }

  const activated = await activate(backendUrl)
  saveToken(activated.token)
  return { token: activated.token, backendUrl, slot: activated.slot, max: activated.max }
}
