/** @jsxImportSource solid-js */
import { createSignal } from "solid-js"
import "./style.css"
import type { FileRenderer, FileRenderProps } from "@opencode-ai/ui/context/file-renderer"

const videoExtensions = new Set(["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv"])

export function VideoFileView(props: FileRenderProps) {
  const [error, setError] = createSignal(false)

  const src = () => {
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
