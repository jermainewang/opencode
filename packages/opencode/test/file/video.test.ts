import { describe, test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { File } from "../../src/file"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("File.read() - video files", () => {
  test("mp4 returns binary type with mimeType video/mp4", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "clip.mp4"), Buffer.from([0x00]))

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.read("clip.mp4")
        expect(result.type).toBe("binary")
        expect(result.content).toBe("")
        expect(result.mimeType).toBe("video/mp4")
      },
    })
  })

  test("webm returns binary type with mimeType video/webm", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "clip.webm"), Buffer.from([0x00]))

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.read("clip.webm")
        expect(result.type).toBe("binary")
        expect(result.content).toBe("")
        expect(result.mimeType).toBe("video/webm")
      },
    })
  })

  test("mov returns binary type with mimeType video/quicktime", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "clip.mov"), Buffer.from([0x00]))

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.read("clip.mov")
        expect(result.type).toBe("binary")
        expect(result.content).toBe("")
        expect(result.mimeType).toBe("video/quicktime")
      },
    })
  })

  test("avi returns binary type with mimeType video/x-msvideo", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "clip.avi"), Buffer.from([0x00]))

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.read("clip.avi")
        expect(result.type).toBe("binary")
        expect(result.content).toBe("")
        expect(result.mimeType).toBe("video/x-msvideo")
      },
    })
  })

  test("mkv returns binary type with mimeType video/x-matroska", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "clip.mkv"), Buffer.from([0x00]))

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.read("clip.mkv")
        expect(result.type).toBe("binary")
        expect(result.content).toBe("")
        expect(result.mimeType).toBe("video/x-matroska")
      },
    })
  })

  test("flv returns binary type with mimeType video/x-flv", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "clip.flv"), Buffer.from([0x00]))

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.read("clip.flv")
        expect(result.type).toBe("binary")
        expect(result.content).toBe("")
        expect(result.mimeType).toBe("video/x-flv")
      },
    })
  })
})
