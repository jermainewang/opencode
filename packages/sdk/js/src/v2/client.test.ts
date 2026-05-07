import { describe, test, expect } from "bun:test"
import { createOpencodeClient } from "./client"

describe("createOpencodeClient file.streamUrl", () => {
  test("includes path as query param", () => {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
    const url = client.file.streamUrl("foo/bar.mp4")
    expect(new URL(url).searchParams.get("path")).toBe("foo/bar.mp4")
  })

  test("does not include directory param when no directory configured", () => {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
    const url = client.file.streamUrl("clip.mp4")
    expect(new URL(url).searchParams.has("directory")).toBe(false)
  })

  test("includes directory param when directory is configured", () => {
    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      directory: "/home/ubuntu",
    })
    const url = client.file.streamUrl("clip.mp4")
    expect(new URL(url).searchParams.get("directory")).toBe("/home/ubuntu")
  })

  test("points to /file/stream endpoint", () => {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
    const url = new URL(client.file.streamUrl("clip.mp4"))
    expect(url.pathname).toBe("/file/stream")
    expect(url.origin).toBe("http://localhost:4096")
  })

  test("strips trailing slash from baseUrl", () => {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096/" })
    const url = new URL(client.file.streamUrl("clip.mp4"))
    expect(url.pathname).toBe("/file/stream")
  })

  test("encodes special characters in path", () => {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })
    const url = client.file.streamUrl("my file (1).mp4")
    expect(new URL(url).searchParams.get("path")).toBe("my file (1).mp4")
  })

  test("encodes non-ASCII directory", () => {
    const client = createOpencodeClient({
      baseUrl: "http://localhost:4096",
      directory: "/home/用户",
    })
    const url = new URL(client.file.streamUrl("clip.mp4"))
    expect(url.searchParams.get("directory")).toBe("/home/用户")
  })

  test("throws when no baseUrl configured", () => {
    const client = createOpencodeClient({ directory: "/home/ubuntu" })
    expect(() => client.file.streamUrl("clip.mp4")).toThrow()
  })
})
