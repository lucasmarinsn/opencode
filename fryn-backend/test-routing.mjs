import { createServer } from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import assert from "node:assert/strict"

const upstreamPort = 18991
const backendPort = 18992
const expectedModels = ["fryn-code", "fryn-fast", "fryn-expert", "fryn-plan", "fryn-vision"]
const expectedCode = "cohere/north-mini-code:free"
const expectedFast = "openai/gpt-oss-120b"
const expectedExpert = "poolside/laguna-m1:free"
const expectedPlan = "nvidia/nemotron-3-ultra-550b-a55b:free"
const expectedVision = "gemini-3.6-flash"
const expectedPaid = "qwen/qwen3.7-flash"
let lastBody
const seenBodies = []

const upstream = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
  seenBodies.push(lastBody)
  const forcePaid = lastBody.messages?.some((message) => message?.content === "force-paid")
  if (forcePaid && lastBody.model === expectedCode) {
    const data = JSON.stringify({ error: { message: "free routes exhausted" } })
    res.writeHead(429, { "content-type": "application/json", "content-length": Buffer.byteLength(data) })
    res.end(data)
    return
  }
  if (lastBody.stream) {
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "x", model: "cohere/north-mini-code:free", choices: [{ delta: { content: "ok" } }] })}\n\n`)
    res.end("data: [DONE]\n\n")
    return
  }
  const data = JSON.stringify({
    id: "x",
    model: "qwen/qwen3-coder:free",
    choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  })
  res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(data) })
  res.end(data)
})

await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve))
const dataDir = await mkdtemp(join(tmpdir(), "fryn-router-test-"))
process.env.PORT = String(backendPort)
process.env.FRYN_DATA_DIR = dataDir
process.env.OPENROUTER_API_KEY = "test-key"
process.env.FRYN_ADMIN_TOKEN = "test-admin-token"
process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${upstreamPort}`
process.env.FRYN_ENABLE_PAID_FALLBACK = "true"
process.env.GROQ_API_KEY = "test-groq-key"
process.env.GROQ_BASE_URL = `http://127.0.0.1:${upstreamPort}`
process.env.GEMINI_API_KEY = "test-gemini-key"
process.env.GEMINI_BASE_URL = `http://127.0.0.1:${upstreamPort}`
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
  assert.deepEqual(health.routing.models, expectedModels)
  assert.equal(health.routing.paidFallback, true)

  const activation = await fetch(`http://127.0.0.1:${backendPort}/api/activate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ installationId: "install_1234567890abcdef", deviceName: "TEST-PC" }),
  })
  assert.equal(activation.status, 200)
  const { token } = await activation.json()
  assert.ok(token.startsWith("fryn_"))

  for (let slot = 2; slot <= 12; slot++) {
    const extra = await fetch(`http://127.0.0.1:${backendPort}/api/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installationId: `install_${String(slot).padStart(16, "0")}`, deviceName: `TEST-PC-${slot}` }),
    })
    assert.equal(extra.status, 200)
  }
  const thirteenth = await fetch(`http://127.0.0.1:${backendPort}/api/activate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ installationId: "install_9999999999999999", deviceName: "TEST-PC-13" }),
  })
  assert.equal(thirteenth.status, 403)
  assert.equal((await thirteenth.json()).error, "license_limit")

  const models = await fetch(`http://127.0.0.1:${backendPort}/v1/models`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json())
  assert.deepEqual(models.data.map((item) => item.id), expectedModels)

  const request = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "assistant", messages: [{ role: "user", content: "test" }] }),
  })
  const text = await request.text()
  assert.equal(request.status, 200)
  assert.equal(lastBody.model, expectedCode)
  assert.equal("models" in lastBody, false)
  assert.equal(lastBody.provider.data_collection, "allow")
  assert.ok(text.includes('"model":"Fryn AI"'))
  assert.ok(!/cohere|qwen|openrouter/i.test(text))

  const beforePaid = seenBodies.length
  const paidRequest = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "assistant", messages: [{ role: "user", content: "force-paid" }] }),
  })
  const paidText = await paidRequest.text()
  assert.equal(paidRequest.status, 200)
  const paidAttempts = seenBodies.slice(beforePaid)
  assert.equal(paidAttempts.length, 2)
  assert.equal(paidAttempts[0].model, expectedCode)
  assert.equal("models" in paidAttempts[0], false)
  assert.equal(paidAttempts[1].model, expectedPaid)
  assert.equal("models" in paidAttempts[1], false)
  assert.ok(paidText.includes('"model":"Fryn AI"'))
  assert.ok(!/cohere|qwen|openrouter/i.test(paidText))

  const expertRequest = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "fryn-expert", messages: [{ role: "user", content: "test" }] }),
  })
  assert.equal(expertRequest.status, 200)
  await expertRequest.text()
  assert.equal(lastBody.model, expectedExpert)

  const planRequest = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "fryn-plan", messages: [{ role: "user", content: "test" }] }),
  })
  assert.equal(planRequest.status, 200)
  await planRequest.text()
  assert.equal(lastBody.model, expectedPlan)

  const fastRequest = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "fryn-fast", messages: [{ role: "user", content: "test" }] }),
  })
  assert.equal(fastRequest.status, 200)
  await fastRequest.text()
  assert.equal(lastBody.model, expectedFast)
  assert.equal("provider" in lastBody, false)

  const visionRequest = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "fryn-vision", messages: [{ role: "user", content: "test" }] }),
  })
  assert.equal(visionRequest.status, 200)
  await visionRequest.text()
  assert.equal(lastBody.model, expectedVision)
  assert.equal("provider" in lastBody, false)

  const stream = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "assistant", stream: true, messages: [{ role: "user", content: "test" }] }),
  })
  const streamed = await stream.text()
  assert.equal(stream.status, 200)
  assert.ok(streamed.includes('"model":"Fryn AI"'))
  assert.ok(!/cohere|qwen|openrouter/i.test(streamed))

  console.log("Fryn routing test: OK")
} finally {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => upstream.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
}
