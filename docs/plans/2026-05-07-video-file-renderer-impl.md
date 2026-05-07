# Video File Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render video files (mp4, webm, mov, avi, mkv, flv) as a native browser `<video>` player in the opencode file viewer, using a new `packages/video-file-renderer` plugin package and a range-aware backend streaming route.

**Architecture:** New plugin package `@opencode-ai/video-file-renderer` implements the `FileRenderer` interface (same pattern as `packages/markdown-file-renderer`). Backend gains `GET /file/stream` with HTTP 206 range-request support so the browser can seek. Video extensions are removed from `binaryExtensions` in `file/index.ts` so `File.read` returns a `mimeType`. `file-tabs.tsx` gets an `isVideo()` guard to route video files into `renderCode()` before the binary-placeholder arm.

**Tech Stack:** SolidJS (`packages/app`, `packages/video-file-renderer`), Bun HTTP (`packages/opencode` Hono routes), TypeScript, bun:test.

**Spec:** `docs/plans/2026-05-07-video-file-renderer.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/opencode/src/file/index.ts` | Modify | Remove video exts from `binaryExtensions`; add video mime-type map |
| `packages/opencode/src/server/routes/file.ts` | Modify | Add `GET /file/stream` with range-request support |
| `packages/opencode/test/file/video.test.ts` | Create | Unit tests for `File.read` mime detection on video files |
| `packages/opencode/test/server/video-stream.test.ts` | Create | HTTP-level tests for the new streaming route |
| `packages/video-file-renderer/package.json` | Create | Package manifest |
| `packages/video-file-renderer/tsconfig.json` | Create | TypeScript config (mirrors markdown-file-renderer) |
| `packages/video-file-renderer/src/index.ts` | Create | Re-exports `videoRenderer` |
| `packages/video-file-renderer/src/renderer.tsx` | Create | `VideoFileView` SolidJS component + `videoRenderer` export |
| `packages/video-file-renderer/src/style.css` | Create | Scoped styles for `[data-video-view="file"]` |
| `packages/video-file-renderer/src/renderer.test.ts` | Create | Unit tests for `videoRenderer.match()` |
| `packages/app/src/app.tsx` | Modify | Register `videoRenderer` in `FileRendererProvider` |
| `packages/app/src/pages/session/file-tabs.tsx` | Modify | Add `isVideo()` memo + `<Match>` arm before `isBinary()` |
| `package.json` (root) | No change needed | `"packages/*"` glob already covers new packages |

---

## Task 1: Remove video extensions from `binaryExtensions` and add mime map

**Files:**
- Modify: `packages/opencode/src/file/index.ts`
- Create: `packages/opencode/test/file/video.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/opencode/test/file/video.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd packages/opencode && bun test test/file/video.test.ts
```

Expected: all 6 tests FAIL (mp4/webm/etc return `{ type: "binary", content: "", mimeType: undefined }` currently — `mimeType` is missing).

- [ ] **Step 3: Implement the changes in `file/index.ts`**

In `packages/opencode/src/file/index.ts`, locate the `binaryExtensions` set (around line 76). Remove these entries:

```
"mp4",
"avi",
"mov",
"wmv",
"flv",
"webm",
"mkv",
```

Then locate the `getImageMimeType` function (around line 214). Add a new `getVideoMimeType` function and a `isVideoByExtension` helper immediately after it:

```ts
const videoMimeTypes: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
}

function getVideoMimeType(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase() ?? ""
  return videoMimeTypes[ext] ?? "video/mp4"
}

function isVideoByExtension(file: string): boolean {
  const ext = file.split(".").pop()?.toLowerCase() ?? ""
  return ext in videoMimeTypes
}
```

Then in the `read` function (around line 427), add a fast-path for video files immediately after the image fast-path block (after the `if (isImageByExtension(file)) { ... }` block):

```ts
if (isVideoByExtension(file)) {
  const mimeType = getVideoMimeType(file)
  return { type: "binary", content: "", mimeType }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd packages/opencode && bun test test/file/video.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Confirm existing file tests still pass**

```bash
cd packages/opencode && bun test test/file/index.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd packages/opencode && git add src/file/index.ts test/file/video.test.ts
git commit -m "feat: add video mime-type detection in File.read"
```

---

## Task 2: Add `GET /file/stream` backend route

**Files:**
- Modify: `packages/opencode/src/server/routes/file.ts`
- Create: `packages/opencode/test/server/video-stream.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/opencode/test/server/video-stream.test.ts`:

```ts
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

    const response = await app.request(
      `/file/stream?path=clip.mp4`,
      { headers: headers(tmp.path) },
    )

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

    const response = await app.request(
      `/file/stream?path=clip.mp4`,
      { headers: { ...headers(tmp.path), range: "bytes=0-9" } },
    )

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

    const response = await app.request(
      `/file/stream?path=clip.mp4`,
      { headers: { ...headers(tmp.path), range: "bytes=10-19" } },
    )

    expect(response.status).toBe(206)
    const body = Buffer.from(await response.arrayBuffer())
    expect(body).toEqual(content.slice(10, 20))
  })

  test("returns 404 for a missing file", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({ directory: tmp.path, fn: async () => {} })
    const app = Server.App()

    const response = await app.request(
      `/file/stream?path=missing.mp4`,
      { headers: headers(tmp.path) },
    )

    expect(response.status).toBe(404)
  })

  test("returns 403 for path traversal attempt", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({ directory: tmp.path, fn: async () => {} })
    const app = Server.App()

    const response = await app.request(
      `/file/stream?path=../../../etc/passwd`,
      { headers: headers(tmp.path) },
    )

    expect(response.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd packages/opencode && bun test test/server/video-stream.test.ts
```

Expected: all 5 tests FAIL with 404 (route does not exist yet).

- [ ] **Step 3: Add the streaming route to `file.ts`**

Open `packages/opencode/src/server/routes/file.ts`. At the top, confirm the existing imports include `path` and `Instance` — they do. Add a `parseRange` helper and the new route.

Append to the end of the `FileRoutes` chain (before the final closing `)` of `lazy()`):

```ts
    .get(
      "/file/stream",
      describeRoute({
        summary: "Stream file",
        description: "Stream a file from the project directory with range-request support for video seeking.",
        operationId: "file.stream",
        responses: {
          200: { description: "Full file stream" },
          206: { description: "Partial content (range request)" },
          403: { description: "Forbidden" },
          404: { description: "Not found" },
        },
      }),
      validator("query", z.object({ path: z.string() })),
      async (c) => {
        const nodePath = await import("node:path")
        const full = nodePath.default.join(Instance.directory, c.req.valid("query").path)
        if (!Instance.containsPath(full)) return c.text("Forbidden", 403)

        const file = Bun.file(full)
        if (!(await file.exists())) return c.text("Not Found", 404)

        const total = file.size
        const mime = file.type || "application/octet-stream"

        const rangeHeader = c.req.header("Range") ?? c.req.header("range")
        if (rangeHeader) {
          const m = rangeHeader.match(/bytes=(\d+)-(\d*)/)
          if (m) {
            const start = parseInt(m[1]!, 10)
            const end = m[2] ? parseInt(m[2], 10) : total - 1
            const clampedEnd = Math.min(end, total - 1)
            return new Response(file.slice(start, clampedEnd + 1).stream(), {
              status: 206,
              headers: {
                "Content-Range": `bytes ${start}-${clampedEnd}/${total}`,
                "Accept-Ranges": "bytes",
                "Content-Length": String(clampedEnd - start + 1),
                "Content-Type": mime,
              },
            })
          }
        }

        return new Response(file.stream(), {
          headers: {
            "Content-Type": mime,
            "Content-Length": String(total),
            "Accept-Ranges": "bytes",
          },
        })
      },
    )
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd packages/opencode && bun test test/server/video-stream.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd packages/opencode && git add src/server/routes/file.ts test/server/video-stream.test.ts
git commit -m "feat: add GET /file/stream route with range-request support"
```

---

## Task 3: Create `packages/video-file-renderer` plugin package

**Files:**
- Create: `packages/video-file-renderer/package.json`
- Create: `packages/video-file-renderer/tsconfig.json`
- Create: `packages/video-file-renderer/src/index.ts`
- Create: `packages/video-file-renderer/src/renderer.tsx`
- Create: `packages/video-file-renderer/src/style.css`
- Modify: `package.json` (root)

- [ ] **Step 1: Add package to root workspace**

In the root `package.json`, find the `workspaces.packages` array:

```json
"packages": [
  "packages/*",
  "packages/console/*",
  "packages/sdk/js",
  "packages/slack"
]
```

It already includes `"packages/*"` — this glob covers any new directory under `packages/`, so **no change is needed** to `package.json`. Verify by continuing.

- [ ] **Step 2: Create `packages/video-file-renderer/package.json`**

```json
{
  "name": "@opencode-ai/video-file-renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@opencode-ai/ui": "workspace:*",
    "solid-js": "catalog:"
  }
}
```

- [ ] **Step 3: Create `packages/video-file-renderer/tsconfig.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["es2023", "dom", "dom.iterable"],
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 4: Create `packages/video-file-renderer/src/style.css`**

```css
[data-video-view="file"] {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 1.5rem;
  box-sizing: border-box;
}

[data-video-view="file"] video {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 6px;
  background: #000;
}

[data-video-view="file"] [data-slot="video-error"] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  opacity: 0.5;
  font-size: 0.875rem;
}
```

- [ ] **Step 5: Create `packages/video-file-renderer/src/renderer.tsx`**

```tsx
/** @jsxImportSource solid-js */
import { createSignal } from "solid-js"
import "./style.css"
import type { FileRenderer, FileRenderProps } from "@opencode-ai/ui/context/file-renderer"

const videoExtensions = new Set(["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv"])

export function VideoFileView(props: FileRenderProps) {
  const [error, setError] = createSignal(false)

  const src = () => {
    // Build the streaming URL using the server base URL injected via the meta prop path.
    // The renderer receives meta.path (relative project path). We construct the API URL
    // by finding the current page's origin — this works because the app is always served
    // from the same origin as the backend when using opencode web or the dev server.
    const base = typeof window !== "undefined" ? window.location.origin : ""
    return `${base}/file/stream?path=${encodeURIComponent(props.meta.path)}`
  }

  return (
    <div data-component="video" data-video-view="file">
      {error() ? (
        <div data-slot="video-error">
          <span>Unable to play video</span>
          <span>{props.meta.path.split("/").pop()}</span>
        </div>
      ) : (
        <video
          controls
          src={src()}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}

export const videoRenderer: FileRenderer = {
  id: "video",
  match(meta) {
    if (meta.mimeType?.startsWith("video/")) return true
    const ext = meta.path.split(".").pop()?.toLowerCase() ?? ""
    return videoExtensions.has(ext)
  },
  component: VideoFileView,
}
```

- [ ] **Step 6: Create `packages/video-file-renderer/src/index.ts`**

```ts
export { videoRenderer } from "./renderer"
```

- [ ] **Step 7: Install dependencies**

```bash
cd packages/video-file-renderer && bun install
```

Expected: `@opencode-ai/video-file-renderer` appears in the workspace; no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/video-file-renderer/
git commit -m "feat: add video-file-renderer plugin package"
```

---

## Task 4: Unit test `videoRenderer.match()`

**Files:**
- Create: `packages/video-file-renderer/src/renderer.test.ts`

The test file lives alongside the source, matching the `packages/app/src/**/*.test.ts` pattern. Since there is no happy-dom preload configured for this package yet (it has no test infrastructure), we write pure-logic tests that do not touch the DOM — `match()` is a plain function.

- [ ] **Step 1: Create the test file**

```ts
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
```

- [ ] **Step 2: Run the tests**

```bash
cd packages/video-file-renderer && bun test src/renderer.test.ts
```

Expected: all 13 tests PASS. (The test file imports `renderer.tsx` directly; Bun handles TSX natively. `match()` does not use any DOM APIs so no happy-dom preload is needed.)

- [ ] **Step 3: Commit**

```bash
git add packages/video-file-renderer/src/renderer.test.ts
git commit -m "test: add videoRenderer.match() unit tests"
```

---

## Task 5: Register `videoRenderer` in `app.tsx`

**Files:**
- Modify: `packages/app/src/app.tsx`

- [ ] **Step 1: Add the import and registration**

In `packages/app/src/app.tsx`, find the existing import:

```ts
import { markdownRenderer } from "@opencode-ai/markdown-file-renderer"
```

Add immediately after it:

```ts
import { videoRenderer } from "@opencode-ai/video-file-renderer"
```

Then find:

```tsx
<FileRendererProvider renderers={[markdownRenderer]}>
```

Change it to:

```tsx
<FileRendererProvider renderers={[markdownRenderer, videoRenderer]}>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/app && bun run typecheck 2>&1 | head -30
```

Expected: no errors related to `video-file-renderer`.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/app.tsx
git commit -m "feat: register videoRenderer in FileRendererProvider"
```

---

## Task 6: Add `isVideo()` guard in `file-tabs.tsx`

**Files:**
- Modify: `packages/app/src/pages/session/file-tabs.tsx`

This prevents video files from hitting the `isBinary()` arm (which renders the "binary content" placeholder). Instead they route through `renderCode()` where the renderer resolver picks `videoRenderer`.

- [ ] **Step 1: Add `isVideo()` memo**

In `packages/app/src/pages/session/file-tabs.tsx`, find the `isBinary` memo (around line 65):

```ts
const isBinary = createMemo(() => state()?.content?.type === "binary")
```

Add `isVideo()` immediately after it:

```ts
const isVideo = createMemo(() => {
  const c = state()?.content
  return c?.type === "binary" && c?.mimeType?.startsWith("video/")
})
```

- [ ] **Step 2: Add the `<Match>` arm for video**

In the `<Switch>` block (around line 577), find the `isBinary` match arm:

```tsx
<Match when={state()?.loaded && isBinary()}>
  <div class="h-full px-6 pb-42 flex flex-col items-center justify-center text-center gap-6">
    <Mark class="w-14 opacity-10" />
    ...
  </div>
</Match>
```

Add a new arm **immediately before** the `isBinary` arm:

```tsx
<Match when={state()?.loaded && isVideo()}>
  {renderCode("", "pb-40")}
</Match>
```

The `renderCode("", "pb-40")` call passes an empty string for content — `VideoFileView` ignores `file.contents` and uses the streaming URL instead. The renderer resolver picks `videoRenderer` based on `mimeType`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd packages/app && bun run typecheck 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/pages/session/file-tabs.tsx
git commit -m "feat: route video files through video renderer in file-tabs"
```

---

## Task 7: Full smoke test

- [ ] **Step 1: Run all backend tests**

```bash
cd packages/opencode && bun test test/file/video.test.ts test/server/video-stream.test.ts test/file/index.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run video-file-renderer unit tests**

```bash
cd packages/video-file-renderer && bun test src/renderer.test.ts
```

Expected: all 13 tests PASS.

- [ ] **Step 3: Start the dev server and verify manually**

```bash
# Terminal 1 — backend
cd packages/opencode && bun run --conditions=browser ./src/index.ts serve --port 4096

# Terminal 2 — frontend
cd packages/app && bun dev -- --port 4444
```

Open `http://localhost:4444`, navigate to a session, open a `.mp4` file in the file viewer.

Verify:
- A `<video controls>` element is rendered (not the "binary content" placeholder)
- The video plays
- The seek bar works (drag it — this exercises the HTTP 206 range-request path)
- Fullscreen button works

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore: cleanup after video renderer integration"
```
