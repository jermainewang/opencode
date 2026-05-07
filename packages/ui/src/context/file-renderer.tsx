import type { Component } from "solid-js"
import { Dynamic } from "solid-js/web"
import { createSimpleContext } from "./helper"
import { useCodeComponent } from "./code"

export type LineRange = {
  start: number
  end: number
  startCol?: number
  endCol?: number
}

export type FileMeta = {
  path: string
  mimeType?: string
  streamUrl?: string
}

export type CommentSurface = {
  anchor(range: LineRange): HTMLElement | undefined
}

export type FileContents = {
  name: string
  contents: string
  cacheKey?: string
}

export type FileRenderMode = "preview" | "edit"

export type FileRenderProps = {
  meta: FileMeta
  file: FileContents
  overflow?: string
  class?: string
  classList?: Record<string, boolean>
  mode?: FileRenderMode

  enableLineSelection?: boolean
  selectedLines?: LineRange | null
  commentedLines?: LineRange[]
  onRendered?: () => void
  onLineSelected?: (range: LineRange | null) => void
  onLineSelectionEnd?: (range: LineRange | null) => void

  surfaceRef?: (surface: CommentSurface | null) => void
}

export type FileRenderer = {
  id: string
  match(meta: FileMeta): boolean
  component: Component<FileRenderProps>
}

type Resolver = {
  resolve(meta: FileMeta): FileRenderer
}

function CodeRenderer(props: FileRenderProps) {
  const code = useCodeComponent()
  const { meta, surfaceRef, ...rest } = props
  return <Dynamic component={code} {...rest} />
}

export const { use: useFileRenderer, provider: FileRendererProvider } = createSimpleContext<
  Resolver,
  { renderers?: FileRenderer[] }
>({
  name: "FileRenderer",
  init: (props) => {
    const renderers = () => {
      const list = props.renderers ?? []
      return [
        ...list,
        {
          id: "code",
          match: () => true,
          component: CodeRenderer,
        } satisfies FileRenderer,
      ]
    }

    return {
      resolve(meta) {
        const list = renderers()
        for (const renderer of list) {
          if (renderer.match(meta)) return renderer
        }
        return list[list.length - 1]!
      },
    }
  },
})
