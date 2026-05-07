import { describe, test, expect, afterAll } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Flag } from "../../src/flag/flag"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterAll(async () => {
  await Instance.disposeAll()
})

function headers(directory: string) {
  const result: Record<string, string> = { "x-opencode-directory": directory }
  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return result
  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
  result.authorization = "Basic " + Buffer.from(username + ":" + password).toString("base64")
  return result
}

describe("GET /file/stream", () => {
  test("returns 200 with Accept-Ranges and Content-Type for a video file", async () => {
    await using tmp = await tmpdir()
    const content = Buffer.alloc(1024, 0xab)
    await fs.writeFile(path.join(tmp.path, "clip.mp4"), content)

    await Instance.provide({ directory: tmp.path, fn: async () => {} })
    const app = Server.App()

    const response = await app.request(`/file/stream?path=clip.mp4`, { headers: headers(tmp.path) })

    expect(response.status).toBe(200)
    expect(response.headers.get("accept-ranges")).toBe("bytes")
    expect(response.headers.get("content-type")).toContain("video/mp4")
    expect(response.headers.get("content-length")).toBe("1024")
  })

  test("returns 206 with Content-Range when Range header is provided", async () => {
    await using tmp = await tmpdir()
    const content = Buffer.alloc(1024, 0xab)
    await fs.writeFile(path.join(tmp.path, "clip.mp4"), content)

    await Instance.provide({ directory: tmp.path, fn: async () => {} })
    const app = Server.App()

    const response = await app.request(`/file/stream?path=clip.mp4`, {
      headers: { ...headers(tmp.path), range: "bytes=0-9" },
    })

    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe("bytes 0-9/1024")
    expect(response.headers.get("content-length")).toBe("10")
    const body = await response.arrayBuffer()
    expect(body.byteLength).toBe(10)
  })

  test("returns correct bytes for a mid-file range request", async () => {
    await using tmp = await tmpdir()
    const content = Buffer.from(Array.from({ length: 256 }, (_, i) => i % 256))
    await fs.writeFile(path.join(tmp.path, "clip.mp4"), content)

    await Instance.provide({ directory: tmp.path, fn: async () => {} })
    const app = Server.App()

    const response = await app.request(`/file/stream?path=clip.mp4`, {
      headers: { ...headers(tmp.path), range: "bytes=10-19" },
    })

    expect(response.status).toBe(206)
    const body = Buffer.from(await response.arrayBuffer())
    expect(body).toEqual(content.slice(10, 20))
  })

  test("returns 404 for a missing file", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({ directory: tmp.path, fn: async () => {} })
    const app = Server.App()

    const response = await app.request(`/file/stream?path=missing.mp4`, { headers: headers(tmp.path) })

    expect(response.status).toBe(404)
  })

  test("returns 403 for path traversal attempt", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({ directory: tmp.path, fn: async () => {} })
    const app = Server.App()

    const response = await app.request(`/file/stream?path=../../../etc/passwd`, { headers: headers(tmp.path) })

    expect(response.status).toBe(403)
  })
})
