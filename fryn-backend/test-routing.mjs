import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

const upstreamPort = 18991
const backendPort = 18992
const expectedTextModel = "mimo-v2.5"
const expectedMultimodalModel = "mimo-v2.5"
let lastBody
let lastAuthorization
let lastPath

const upstream = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")
  lastAuthorization = req.headers.authorization
  lastPath = req.url
  if (lastBody.stream) {
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ id: "x", model: lastBody.model, choices: [{ delta: { content: "ok" } }] })}\n\n`)
    res.end("data: [DONE]\n\n")
    return
  }
  const wantsTool = Array.isArray(lastBody.tools) && lastBody.messages?.some((message) => String(message.content).includes("use tool"))
  const data = JSON.stringify({
    id: "x",
    model: lastBody.model,
    choices: [
      wantsTool
        ? {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "call_test", type: "function", function: { name: "read_oee", arguments: '{"date":"2026-08-26"}' } }],
            },
            finish_reason: "tool_calls",
          }
        : { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  })
  res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(data) })
  res.end(data)
})

await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve))
const dataDir = await mkdtemp(join(tmpdir(), "fryn-router-test-"))
process.env.PORT = String(backendPort)
process.env.FRYN_DATA_DIR = dataDir
process.env.FRYN_ADMIN_TOKEN = "test-admin-token"
process.env.FRYN_UPSTREAM_PROVIDER = "mimo"
process.env.MIMO_API_KEY = "test-mimo-key"
process.env.MIMO_BASE_URL = `http://127.0.0.1:${upstreamPort}`
process.env.FRYN_CODEX_MIMO_BASE_URL = `http://127.0.0.1:${upstreamPort}`
delete process.env.FRYN_UPSTREAM_BASE_URL
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
  assert.equal(health.routing.provider, "Xiaomi MiMo")

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
  assert.deepEqual(models.data[0].modalities, { input: ["text", "image", "pdf"], output: ["text"] })
  assert.deepEqual(models.data[0].capabilities, { tools: false, input: ["text", "image", "pdf"], output: ["text"] })

  const codexModels = await fetch(`http://127.0.0.1:${backendPort}/codex/v1/models`, {
    headers: { authorization: "Bearer sk-test-codex-key" },
  }).then((response) => response.json())
  assert.deepEqual(codexModels.data.map((item) => item.id), ["fryn-oee"])

  const codexResponse = await fetch(`http://127.0.0.1:${backendPort}/codex/v1/responses`, {
    method: "POST",
    headers: { authorization: "Bearer sk-test-codex-key", "content-type": "application/json" },
    body: JSON.stringify({
      model: "fryn-oee",
      instructions: "Ajude com OEE.",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "responda ok" }] }],
    }),
  })
  const codexJson = await codexResponse.json()
  assert.equal(codexResponse.status, 200)
  assert.equal(codexJson.object, "response")
  assert.equal(codexJson.model, "fryn-oee")
  assert.equal(codexJson.output[0].content[0].text, "ok")
  assert.deepEqual(codexJson.usage, { input_tokens: 10, output_tokens: 2, total_tokens: 12 })
  assert.equal(lastAuthorization, "Bearer sk-test-codex-key")
  assert.equal(lastPath, "/chat/completions")
  assert.equal(lastBody.model, "mimo-v2.5")
  assert.deepEqual(lastBody.messages[0], { role: "system", content: "Ajude com OEE." })

  const codexTool = await fetch(`http://127.0.0.1:${backendPort}/codex/v1/responses`, {
    method: "POST",
    headers: { authorization: "Bearer sk-test-codex-key", "content-type": "application/json" },
    body: JSON.stringify({
      model: "fryn-oee",
      input: "use tool",
      tools: [{ type: "function", name: "read_oee", description: "Le o OEE", parameters: { type: "object", properties: {} } }],
      stream: true,
    }),
  })
  const codexEvents = await codexTool.text()
  assert.equal(codexTool.status, 200)
  assert.match(codexTool.headers.get("content-type"), /text\/event-stream/)
  assert.ok(codexEvents.includes("response.function_call_arguments.done"))
  assert.ok(codexEvents.includes('"name":"read_oee"'))
  assert.ok(codexEvents.includes("response.completed"))
  assert.ok(!/xiaomi|mimo-v2/i.test(codexEvents))

  const invalidCodexKey = await fetch(`http://127.0.0.1:${backendPort}/codex/v1/responses`, {
    method: "POST",
    headers: { authorization: "Bearer invalid", "content-type": "application/json" },
    body: JSON.stringify({ model: "fryn-oee", input: "test" }),
  })
  assert.equal(invalidCodexKey.status, 401)

  for (const model of ["assistant", "fryn-code", "fryn-fast", "fryn-expert", "fryn-plan", "fryn-vision"]) {
    const response = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "test" }] }),
    })
    const text = await response.text()
    assert.equal(response.status, 200)
    assert.equal(lastBody.model, expectedTextModel)
    assert.equal("models" in lastBody, false)
    assert.equal("provider" in lastBody, false)
    assert.ok(text.includes('"model":"Fryn AI"'))
    assert.ok(!/xiaomi|openrouter|north|mimo|opencode|zen/i.test(text))
  }

  const vision = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "assistant",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "describe" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
      ],
    }),
  })
  assert.equal(vision.status, 200)
  assert.equal(lastBody.model, expectedMultimodalModel)

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
  assert.ok(!/xiaomi|openrouter|north|mimo|opencode|zen/i.test(streamed))

  console.log("Fryn single-model routing test: OK")
} finally {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => upstream.close(resolve))
  await rm(dataDir, { recursive: true, force: true })
}
