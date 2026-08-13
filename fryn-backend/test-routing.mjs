import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

const upstreamPort = 18991
const backendPort = 18992
const expectedModel = "openrouter/free"
let lastBody

const upstream = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
  if (lastBody.stream) {
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "x", model: expectedModel, choices: [{ delta: { content: "ok" } }] })}\n\n`)
    res.end("data: [DONE]\n\n")
    return
  }
  const data = JSON.stringify({
    id: "x",
    model: expectedModel,
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  })
  res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(data) })
  res.end(data)
})

await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve))
const dataDir = await mkdtemp(join(tmpdir(), "fryn-router-test-"))
process.env.PORT = String(backendPort)
process.env.FRYN_DATA_DIR = dataDir
process.env.FRYN_ADMIN_TOKEN = "test-admin-token"
process.env.OPENROUTER_API_KEY = "test-openrouter-key"
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}`
const { server } = await import(`./server.mjs?test=${Date.now()}`)

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/health`)
      if (response.ok) return response.json()
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("backend did not start")
}

try {
  const health = await waitForHealth()
  assert.equal(health.routing.mode, "direct")
  assert.deepEqual(health.routing.models, ["assistant"])
  assert.equal(health.routing.paidFallback, false)
  assert.equal(health.routing.provider, "openrouter-free-router")

  const activation = await fetch(`http://127.0.0.1:${backendPort}/api/activate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ installationId: "install_1234567890abcdef", deviceName: "TEST-PC" }),
  })
  assert.equal(activation.status, 200)
  const { token } = await activation.json()
  assert.ok(token.startsWith("fryn_"))

  const models = await fetch(`http://127.0.0.1:${backendPort}/v1/models`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((response) => response.json())
  assert.deepEqual(models.data.map((item) => item.id), ["assistant"])

  for (const model of ["assistant", "fryn-code", "fryn-fast", "fryn-expert", "fryn-plan", "fryn-vision"]) {
    const response = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "test" }] }),
    })
    const text = await response.text()
    assert.equal(response.status, 200)
    assert.equal(lastBody.model, expectedModel)
    assert.equal("models" in lastBody, false)
    assert.equal("provider" in lastBody, false)
    assert.ok(text.includes('"model":"Fryn AI"'))
    assert.ok(!/openrouter|north|mimo|opencode|zen/i.test(text))
  }

  const invalid = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "unknown", messages: [{ role: "user", content: "test" }] }),
  })
  assert.equal(invalid.status, 400)

  const stream = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "assistant", stream: true, messages: [{ role: "user", content: "test" }] }),
  })
  const streamed = await stream.text()
  assert.equal(stream.status, 200)
  assert.ok(streamed.includes('"model":"Fryn AI"'))
  assert.ok(!/openrouter|north|mimo|opencode|zen/i.test(streamed))

  console.log("Fryn single-model routing test: OK")
} finally {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => upstream.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
}
