# Video File Renderer (Plugin) — Design

**Goal:** Render video files (mp4, webm, mov, avi, mkv, flv) as a native browser video player in the session file viewer, following the same plugin architecture used by the Markdown renderer.

**Approach:** New package `packages/video-file-renderer` that implements `FileRenderer` and registers in `app.tsx` alongside `markdownRenderer`. Backend gains a range-aware streaming route so the browser can seek without downloading the entire file.

---

## Background

The file viewer in `packages/app/src/pages/session/file-tabs.tsx` resolves a renderer via `useFileRenderer().resolve({ path, mimeType })` and renders it with SolidJS `<Dynamic>`. The extension point (`FileRendererProvider` / `FileRenderer`) was introduced for the Markdown renderer and documented in `docs/frontend-renderers.md`.

Currently all video extensions (`mp4`, `webm`, `mov`, etc.) are in `binaryExtensions` in `packages/opencode/src/file/index.ts`, so `File.read` returns `{ type: "binary", content: "" }` with no data and no mimeType. The file viewer renders the generic "binary content" placeholder.

---

## Requirements

1. Video files open as a playable video player in the file tab.
2. Seeking works — the browser must be able to issue range requests.
3. No comment workflow needed — the renderer does not need to support `onLineSelected` / `surfaceRef`.
4. Supported extensions: `mp4`, `webm`, `mov`, `avi`, `mkv`, `flv`.
5. Minimal changes to upstream opencode core; changes must be additive.
6. Architecture mirrors `packages/markdown-file-renderer` exactly.

## Non-Goals

- Timestamp-based inline comments.
- Custom player controls (use native browser `<video controls>`).
- Subtitle / caption support.
- Codec transcoding or server-side re-encoding.

---

## Design

### 1. Backend: remove video extensions from `binaryExtensions`

In `packages/opencode/src/file/index.ts`, remove from `binaryExtensions`:

```
mp4, avi, mov, wmv, flv, webm, mkv
```

Also add video mime-type lookup alongside the existing image mime-type map so `File.read` returns the correct `mimeType` for video files (e.g. `video/mp4`). The file content itself is not needed — `File.read` can return `{ type: "binary", content: "", mimeType: "video/mp4" }` (a binary stub with mimeType). The renderer will not use `file.contents`; it will build a streaming URL instead.

### 2. Backend: new streaming route `GET /file/stream`

Add to `packages/opencode/src/server/routes/file.ts`:

```ts
.get(
  "/file/stream",
  validator("query", z.object({ path: z.string() })),
  async (c) => {
    const full = path.join(Instance.directory, c.req.valid("query").path)
    if (!Instance.containsPath(full)) return c.text("Forbidden", 403)

    const file = Bun.file(full)
    if (!(await file.exists())) return c.text("Not Found", 404)

    const total = file.size
    const mime = file.type || "application/octet-stream"

    const range = c.req.header("Range")
    if (range) {
      const [start, end] = parseRange(range, total)   // helper: parse "bytes=X-Y"
      return new Response(file.slice(start, end + 1).stream(), {
        status: 206,
        headers: {
          "Content-Range":  `bytes ${start}-${end}/${total}`,
          "Accept-Ranges":  "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Type":   mime,
        },
      })
    }

    return new Response(file.stream(), {
      headers: {
        "Content-Type":   mime,
        "Content-Length": String(total),
        "Accept-Ranges":  "bytes",
      },
    })
  }
)
```

Key points:
- HTTP 206 + `Accept-Ranges: bytes` is required for browser seek to work. Without it the browser downloads the whole file before seeking is possible.
- `Bun.file().slice(start, end+1).stream()` reads only the requested byte range — no full-file memory load.
- Same path security check (`Instance.containsPath`) as `/file/content`.
- No additional auth — consistent with all other file routes (server already binds to localhost in normal use).

### 3. Frontend: new package `packages/video-file-renderer`

Structure mirrors `packages/markdown-file-renderer`:

```
packages/video-file-renderer/
  package.json          name: "@opencode-ai/video-file-renderer"
  tsconfig.json
  src/
    index.ts            re-exports videoRenderer
    renderer.tsx        VideoFileView component + videoRenderer FileRenderer
    style.css           scoped to [data-video-view="file"]
```

**`renderer.tsx` responsibilities:**

- `match(meta)`: returns true if `meta.mimeType?.startsWith("video/")` or the file extension is one of `mp4 | webm | mov | avi | mkv | flv` (case-insensitive).
- `VideoFileView` component:
  - Receives `FileRenderProps` (accepts all props, ignores selection/comment props).
  - Constructs the stream URL: `` `${sdkBase}/file/stream?path=${encodeURIComponent(meta.path)}` `` using the same server base URL as other SDK calls.
  - Renders a `<video controls>` element with the URL as `src`.
  - Shows an error fallback if the video fails to load (`onerror`).
  - Root element: `<div data-video-view="file">`.
- `videoRenderer` export: `{ id: "video", match, component: VideoFileView }`.

**URL construction:**

The frontend needs the backend base URL. The existing SDK context (used throughout the app for API calls) provides this. `VideoFileView` should use the same mechanism as other components — e.g. `useServer()` or the SDK client — rather than hardcoding `localhost:4096`.

### 4. Frontend: register in `app.tsx`

```ts
import { videoRenderer } from "@opencode-ai/video-file-renderer"

// in FileRendererProvider:
<FileRendererProvider renderers={[markdownRenderer, videoRenderer]}>
```

Renderer resolution is first-match; video files will never match the markdown renderer so order between the two does not matter.

### 5. `file-tabs.tsx` — add `isVideo()` guard

The existing `isBinary()` check keys off `state()?.content?.type === "binary"`. Since `File.read` for video returns `{ type: "binary", content: "", mimeType: "video/mp4" }`, video files would hit the binary placeholder before the renderer resolver is reached.

Fix: add an `isVideo()` memo (mirroring `isImage()`) that checks `mimeType?.startsWith("video/")`, and add a dedicated `<Match>` arm for it **before** the `isBinary()` arm. That arm calls `renderCode(...)` normally — the renderer resolver then picks `videoRenderer` based on the mimeType. No other logic in `file-tabs.tsx` changes.

---

## Data Flow (End-to-End)

1. User opens a `.mp4` file in the file viewer.
2. `File.read` returns `{ type: "binary", content: "", mimeType: "video/mp4" }`.
3. `file-tabs.tsx`: `isVideo()` is true → `renderCode(...)` is called (or a direct `<video>` render path).
4. `renderer.resolve({ path, mimeType: "video/mp4" })` → returns `videoRenderer`.
5. `<Dynamic component={VideoFileView} .../>` renders.
6. `VideoFileView` constructs `GET /file/stream?path=…` URL, sets it as `<video src>`.
7. Browser requests the URL; backend responds with `Content-Type: video/mp4`, `Accept-Ranges: bytes`.
8. Browser renders native video player with seek, volume, fullscreen.
9. On seek: browser sends `Range: bytes=X-Y`; backend responds HTTP 206 with the byte slice.

---

## Security

- Path traversal: `Instance.containsPath(full)` blocks any path that escapes the project directory.
- No file content is exposed through the existing `File.read` API (content is empty string).
- The streaming route is consistent with the existing static file serving in `server.ts` (which already streams project files for the UI bundle).

## Testing

- Unit: given a video file path, `videoRenderer.match({ path: "clip.mp4", mimeType: "video/mp4" })` returns true; `.match({ path: "README.md" })` returns false.
- Unit: `GET /file/stream?path=clip.mp4` with no `Range` header returns 200 with `Accept-Ranges: bytes`.
- Unit: `GET /file/stream?path=clip.mp4` with `Range: bytes=0-1023` returns 206 with correct `Content-Range`.
- Unit: path traversal attempt (`../../../etc/passwd`) returns 403.
- Manual: open a `.mp4` file in the file viewer — player renders; seek bar works; fullscreen works.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/opencode/src/file/index.ts` | Remove video exts from `binaryExtensions`; add video mime-type map |
| `packages/opencode/src/server/routes/file.ts` | Add `GET /file/stream` route with range-request support |
| `packages/video-file-renderer/` | New plugin package |
| `packages/app/src/app.tsx` | Register `videoRenderer` in `FileRendererProvider` |
| `packages/app/src/pages/session/file-tabs.tsx` | Add `isVideo()` memo + `<Match>` arm to route video files away from binary placeholder |
| `package.json` / `pnpm-workspace.yaml` | Add `packages/video-file-renderer` to workspace |
