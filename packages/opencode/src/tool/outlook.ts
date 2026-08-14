import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"

const AUTH_FILE = path.join(Global.Path.data, "fryn-outlook-auth.json")
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
const MICROSOFT_SCOPES = ["openid", "profile", "offline_access", "User.Read", "Calendars.ReadWrite", "Mail.Send"]
const DEFAULT_TENANT = "common"

type AuthStore = {
  pending?: {
    deviceCode: string
    userCode: string
    verificationUri: string
    expiresAt: number
    interval: number
  }
  token?: {
    accessToken: string
    refreshToken?: string
    expiresAt: number
  }
  account?: {
    displayName?: string
    mail?: string
    userPrincipalName?: string
  }
}

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval?: number
  message?: string
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type GraphUser = {
  displayName?: string
  mail?: string
  userPrincipalName?: string
}

type GraphEvent = {
  id?: string
  subject?: string
  webLink?: string
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  location?: { displayName?: string }
  organizer?: { emailAddress?: { name?: string; address?: string } }
}

function microsoftClientId() {
  return process.env.FRYN_MICROSOFT_CLIENT_ID?.trim() ?? ""
}

function microsoftTenant() {
  return process.env.FRYN_MICROSOFT_TENANT?.trim() || DEFAULT_TENANT
}

function microsoftUrl(pathname: string) {
  return `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/${pathname}`
}

async function loadAuth(): Promise<AuthStore> {
  try {
    return JSON.parse(await readFile(AUTH_FILE, "utf8")) as AuthStore
  } catch {
    return {}
  }
}

async function saveAuth(auth: AuthStore) {
  await mkdir(path.dirname(AUTH_FILE), { recursive: true })
  await writeFile(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 })
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const error = body as { error?: string; error_description?: string; message?: string }
    throw new Error(error.error_description ?? error.message ?? error.error ?? `Microsoft request failed: ${response.status}`)
  }
  return body as T
}

async function beginDeviceLogin() {
  const clientId = microsoftClientId()
  if (!clientId) throw new Error("Microsoft Client ID nao configurado no Fryn.")

  const body = new URLSearchParams({
    client_id: clientId,
    scope: MICROSOFT_SCOPES.join(" "),
  })

  const response = await requestJson<DeviceCodeResponse>(microsoftUrl("devicecode"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })

  const auth = await loadAuth()
  auth.pending = {
    deviceCode: response.device_code,
    userCode: response.user_code,
    verificationUri: response.verification_uri,
    expiresAt: Date.now() + response.expires_in * 1000,
    interval: response.interval ?? 5,
  }
  await saveAuth(auth)
  return auth.pending
}

async function finishDeviceLogin() {
  const clientId = microsoftClientId()
  if (!clientId) throw new Error("Microsoft Client ID nao configurado no Fryn.")

  const auth = await loadAuth()
  const pending = auth.pending
  if (!pending) throw new Error("Nenhum login Microsoft pendente. Use outlook_connect primeiro.")
  if (pending.expiresAt <= Date.now()) {
    delete auth.pending
    await saveAuth(auth)
    throw new Error("O codigo Microsoft expirou. Use outlook_connect novamente.")
  }

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: clientId,
    device_code: pending.deviceCode,
  })

  const response = await fetch(microsoftUrl("token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
  const token = (await response.json()) as TokenResponse

  if (!response.ok) {
    if (token.error === "authorization_pending") {
      throw new Error(`Login ainda nao concluido. Abra ${pending.verificationUri} e digite o codigo ${pending.userCode}.`)
    }
    if (token.error === "authorization_declined") throw new Error("Login Microsoft recusado pelo usuario.")
    if (token.error === "expired_token") throw new Error("O codigo Microsoft expirou. Use outlook_connect novamente.")
    throw new Error(token.error_description ?? token.error ?? "Nao foi possivel concluir o login Microsoft.")
  }

  auth.token = {
    accessToken: token.access_token ?? "",
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  }
  delete auth.pending
  const account = await graph<GraphUser>("/me", { method: "GET" }, auth.token.accessToken)
  auth.account = account
  await saveAuth(auth)
  return account
}

async function refreshAccessToken(auth: AuthStore) {
  const clientId = microsoftClientId()
  const refreshToken = auth.token?.refreshToken
  if (!clientId) throw new Error("Microsoft Client ID nao configurado no Fryn.")
  if (!refreshToken) throw new Error("Microsoft nao conectado. Use outlook_connect primeiro.")

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES.join(" "),
  })

  const token = await requestJson<TokenResponse>(microsoftUrl("token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })

  auth.token = {
    accessToken: token.access_token ?? "",
    refreshToken: token.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  }
  await saveAuth(auth)
  return auth.token.accessToken
}

async function accessToken() {
  const auth = await loadAuth()
  if (!auth.token?.accessToken) throw new Error("Microsoft nao conectado. Use outlook_connect primeiro.")
  if (auth.token.expiresAt - Date.now() < 60_000) return refreshAccessToken(auth)
  return auth.token.accessToken
}

async function graph<T>(pathname: string, init: RequestInit, token?: string): Promise<T> {
  const access = token ?? (await accessToken())
  const response = await fetch(`${GRAPH_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const error = body as { error?: { message?: string }; message?: string }
    throw new Error(error.error?.message ?? error.message ?? `Microsoft Graph failed: ${response.status}`)
  }
  return body as T
}

function asDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Data invalida: ${value}`)
  return date
}

function eventSummary(event: GraphEvent) {
  return {
    id: event.id,
    subject: event.subject,
    start: event.start,
    end: event.end,
    location: event.location?.displayName,
    organizer: event.organizer?.emailAddress,
    webLink: event.webLink,
  }
}

function recipients(emails: readonly string[] | undefined) {
  return (emails ?? []).map((address) => ({ emailAddress: { address } }))
}

export const OutlookConnectTool = Tool.define(
  "outlook_connect",
  Effect.gen(function* () {
    return {
      description: "Start Microsoft Outlook sign-in for Fryn. Use this before calendar or email tools.",
      parameters: Schema.Struct({}),
      execute: () =>
        Effect.promise(async () => {
          const pending = await beginDeviceLogin()
          return {
            title: "Microsoft login started",
            metadata: {},
            output: [
              "Abra este link para conectar o Outlook:",
              pending.verificationUri,
              "",
              `Codigo: ${pending.userCode}`,
              "",
              "Depois de concluir no navegador, peca para finalizar o login Microsoft.",
            ].join("\n"),
          }
        }),
    }
  }),
)

export const OutlookFinishConnectTool = Tool.define(
  "outlook_finish_connect",
  Effect.gen(function* () {
    return {
      description: "Finish a pending Microsoft Outlook sign-in after the user entered the device code.",
      parameters: Schema.Struct({}),
      execute: () =>
        Effect.promise(async () => {
          const account = await finishDeviceLogin()
          return {
            title: "Microsoft connected",
            metadata: { account },
            output: `Microsoft conectado: ${account.displayName ?? account.mail ?? account.userPrincipalName ?? "conta conectada"}`,
          }
        }),
    }
  }),
)

const CalendarRangeParameters = Schema.Struct({
  start: Schema.optional(Schema.String).annotate({ description: "Start datetime, ISO format. Defaults to now." }),
  end: Schema.optional(Schema.String).annotate({ description: "End datetime, ISO format. Defaults to seven days from now." }),
  top: Schema.optional(Schema.Number).annotate({ description: "Maximum number of events to return. Defaults to 20." }),
})

export const OutlookListEventsTool = Tool.define(
  "outlook_list_events",
  Effect.gen(function* () {
    return {
      description: "List Microsoft Outlook calendar events in a date range.",
      parameters: CalendarRangeParameters,
      execute: (params: Schema.Schema.Type<typeof CalendarRangeParameters>) =>
        Effect.promise(async () => {
          const now = new Date()
          const start = asDate(params.start, now)
          const end = asDate(params.end, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))
          const top = Math.max(1, Math.min(params.top ?? 20, 50))
          const query = new URLSearchParams({
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
            $orderby: "start/dateTime",
            $top: String(top),
          })
          const result = await graph<{ value?: GraphEvent[] }>(`/me/calendarView?${query.toString()}`, { method: "GET" })
          const events = (result.value ?? []).map(eventSummary)
          return {
            title: `${events.length} Outlook events`,
            metadata: { count: events.length },
            output: JSON.stringify(events, null, 2),
          }
        }),
    }
  }),
)

export const OutlookCheckAvailabilityTool = Tool.define(
  "outlook_check_availability",
  Effect.gen(function* () {
    return {
      description: "Check whether the user's Outlook calendar has events in a date range.",
      parameters: CalendarRangeParameters,
      execute: (params: Schema.Schema.Type<typeof CalendarRangeParameters>) =>
        Effect.promise(async () => {
          const now = new Date()
          const start = asDate(params.start, now)
          const end = asDate(params.end, new Date(now.getTime() + 60 * 60 * 1000))
          const query = new URLSearchParams({
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
            $orderby: "start/dateTime",
            $top: String(Math.max(1, Math.min(params.top ?? 20, 50))),
          })
          const result = await graph<{ value?: GraphEvent[] }>(`/me/calendarView?${query.toString()}`, { method: "GET" })
          const events = (result.value ?? []).map(eventSummary)
          return {
            title: events.length ? "Outlook calendar busy" : "Outlook calendar available",
            metadata: { busy: events.length > 0, count: events.length },
            output: JSON.stringify({ available: events.length === 0, conflicts: events }, null, 2),
          }
        }),
    }
  }),
)

const CreateEventParameters = Schema.Struct({
  subject: Schema.String,
  start: Schema.String.annotate({ description: "Event start datetime, ISO format." }),
  end: Schema.String.annotate({ description: "Event end datetime, ISO format." }),
  timeZone: Schema.optional(Schema.String).annotate({ description: "Outlook timezone. Defaults to America/Sao_Paulo." }),
  attendees: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Attendee email addresses." }),
  body: Schema.optional(Schema.String),
  location: Schema.optional(Schema.String),
})

export const OutlookCreateEventTool = Tool.define(
  "outlook_create_event",
  Effect.gen(function* () {
    return {
      description: "Create a Microsoft Outlook calendar event or meeting. Requires user approval before creating.",
      parameters: CreateEventParameters,
      execute: (params: Schema.Schema.Type<typeof CreateEventParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "outlook_create_event",
            patterns: [params.subject],
            always: [],
            metadata: {
              subject: params.subject,
              start: params.start,
              end: params.end,
              attendees: params.attendees ?? [],
            },
          })
          const timeZone = params.timeZone ?? "America/Sao_Paulo"
          const event = yield* Effect.promise(() =>
            graph<GraphEvent>("/me/events", {
              method: "POST",
              body: JSON.stringify({
                subject: params.subject,
                body: params.body ? { contentType: "Text", content: params.body } : undefined,
                start: { dateTime: params.start, timeZone },
                end: { dateTime: params.end, timeZone },
                location: params.location ? { displayName: params.location } : undefined,
                attendees: recipients(params.attendees).map((emailAddress) => ({
                  ...emailAddress,
                  type: "required",
                })),
              }),
            }),
          )
          return {
            title: "Outlook event created",
            metadata: { id: event.id, webLink: event.webLink },
            output: JSON.stringify(eventSummary(event), null, 2),
          }
        }),
    }
  }),
)

const EmailParameters = Schema.Struct({
  to: Schema.Array(Schema.String).annotate({ description: "Recipient email addresses." }),
  subject: Schema.String,
  body: Schema.String,
  cc: Schema.optional(Schema.Array(Schema.String)),
})

export const OutlookDraftEmailTool = Tool.define(
  "outlook_draft_email",
  Effect.gen(function* () {
    return {
      description: "Create a draft email in Microsoft Outlook. Requires user approval before creating the draft.",
      parameters: EmailParameters,
      execute: (params: Schema.Schema.Type<typeof EmailParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "outlook_draft_email",
            patterns: params.to,
            always: [],
            metadata: { to: params.to, cc: params.cc ?? [], subject: params.subject },
          })
          const draft = yield* Effect.promise(() =>
            graph<{ id?: string; webLink?: string }>("/me/messages", {
              method: "POST",
              body: JSON.stringify({
                subject: params.subject,
                body: { contentType: "Text", content: params.body },
                toRecipients: recipients(params.to),
                ccRecipients: recipients(params.cc),
              }),
            }),
          )
          return {
            title: "Outlook draft created",
            metadata: { id: draft.id, webLink: draft.webLink },
            output: JSON.stringify({ id: draft.id, webLink: draft.webLink }, null, 2),
          }
        }),
    }
  }),
)

export const OutlookSendEmailTool = Tool.define(
  "outlook_send_email",
  Effect.gen(function* () {
    return {
      description: "Send an email through Microsoft Outlook. Requires user approval before sending.",
      parameters: EmailParameters,
      execute: (params: Schema.Schema.Type<typeof EmailParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "outlook_send_email",
            patterns: params.to,
            always: [],
            metadata: {
              to: params.to,
              cc: params.cc ?? [],
              subject: params.subject,
              bodyPreview: params.body.slice(0, 300),
            },
          })
          yield* Effect.promise(() =>
            graph<void>("/me/sendMail", {
              method: "POST",
              body: JSON.stringify({
                message: {
                  subject: params.subject,
                  body: { contentType: "Text", content: params.body },
                  toRecipients: recipients(params.to),
                  ccRecipients: recipients(params.cc),
                },
                saveToSentItems: true,
              }),
            }),
          )
          return {
            title: "Outlook email sent",
            metadata: { to: params.to, cc: params.cc ?? [], subject: params.subject },
            output: `Email enviado para ${params.to.join(", ")}.`,
          }
        }),
    }
  }),
)
