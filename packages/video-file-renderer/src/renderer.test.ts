import { describe, test, expect } from "bun:test"
import { videoRenderer } from "./renderer"

describe("videoRenderer.match()", () => {
  test("matches video/mp4 mimeType", () => {
    expect(videoRenderer.match({ path: "clip.mp4", mimeType: "video/mp4" })).toBe(true)
  })

  test("matches video/webm mimeType", () => {
    expect(videoRenderer.match({ path: "clip.webm", mimeType: "video/webm" })).toBe(true)
  })

  test("matches any video/* mimeType", () => {
    expect(videoRenderer.match({ path: "unknown.bin", mimeType: "video/ogg" })).toBe(true)
  })

  test("matches mp4 extension when no mimeType", () => {
    expect(videoRenderer.match({ path: "clip.mp4" })).toBe(true)
  })

  test("matches webm extension when no mimeType", () => {
    expect(videoRenderer.match({ path: "clip.webm" })).toBe(true)
  })

  test("matches mov extension (case-insensitive)", () => {
    expect(videoRenderer.match({ path: "clip.MOV" })).toBe(true)
  })

  test("matches avi extension", () => {
    expect(videoRenderer.match({ path: "clip.avi" })).toBe(true)
  })

  test("matches mkv extension", () => {
    expect(videoRenderer.match({ path: "clip.mkv" })).toBe(true)
  })

  test("matches flv extension", () => {
    expect(videoRenderer.match({ path: "clip.flv" })).toBe(true)
  })

  test("does not match .md file", () => {
    expect(videoRenderer.match({ path: "README.md" })).toBe(false)
  })

  test("does not match image mimeType", () => {
    expect(videoRenderer.match({ path: "photo.png", mimeType: "image/png" })).toBe(false)
  })

  test("does not match text file", () => {
    expect(videoRenderer.match({ path: "main.ts" })).toBe(false)
  })

  test("id is 'video'", () => {
    expect(videoRenderer.id).toBe("video")
  })
})
