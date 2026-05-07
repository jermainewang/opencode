export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { File, OpencodeClient } from "./gen/sdk.gen.js"
export { type Config as OpencodeClientConfig, OpencodeClient }

export type FileWithStream = File & { streamUrl(path: string): string }

export function createOpencodeClient(config?: Config & { directory?: string }) {
  if (!config?.fetch) {
    const customFetch: any = (req: any) => {
      // @ts-ignore
      req.timeout = false
      return fetch(req)
    }
    config = {
      ...config,
      fetch: customFetch,
    }
  }

  const directory = config?.directory
  if (directory) {
    const isNonASCII = /[^\x00-\x7F]/.test(directory)
    const encodedDirectory = isNonASCII ? encodeURIComponent(directory) : directory
    config.headers = {
      ...config.headers,
      "x-opencode-directory": encodedDirectory,
    }
  }

  const underlying = createClient(config)
  const opencodeClient = new OpencodeClient({ client: underlying })

  const baseUrl = (config?.baseUrl ?? "").replace(/\/$/, "")

  const fileWithStream = Object.create(opencodeClient.file, {
    streamUrl: {
      value(path: string): string {
        const url = new URL(`${baseUrl}/file/stream`)
        url.searchParams.set("path", path)
        if (directory) url.searchParams.set("directory", directory)
        return url.toString()
      },
      writable: true,
      configurable: true,
    },
  }) as FileWithStream

  return new Proxy(opencodeClient, {
    get(target, prop) {
      if (prop === "file") return fileWithStream
      const val = (target as any)[prop]
      return typeof val === "function" ? val.bind(target) : val
    },
  }) as OpencodeClient & { file: FileWithStream }
}
