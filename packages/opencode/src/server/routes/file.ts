import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import nodePath from "node:path"
import z from "zod"
import { File } from "../../file"
import { Ripgrep } from "../../file/ripgrep"
import { LSP } from "../../lsp"
import { Instance } from "../../project/instance"
import { lazy } from "../../util/lazy"
import { git } from "../../util/git"

export const FileRoutes = lazy(() =>
  new Hono()
    .get(
      "/find",
      describeRoute({
        summary: "Find text",
        description: "Search for text patterns across files in the project using ripgrep.",
        operationId: "find.text",
        responses: {
          200: {
            description: "Matches",
            content: {
              "application/json": {
                schema: resolver(Ripgrep.Match.shape.data.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          pattern: z.string(),
        }),
      ),
      async (c) => {
        const pattern = c.req.valid("query").pattern
        const result = await Ripgrep.search({
          cwd: Instance.directory,
          pattern,
          limit: 10,
        })
        return c.json(result)
      },
    )
    .get(
      "/find/file",
      describeRoute({
        summary: "Find files",
        description: "Search for files or directories by name or pattern in the project directory.",
        operationId: "find.files",
        responses: {
          200: {
            description: "File paths",
            content: {
              "application/json": {
                schema: resolver(z.string().array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
          dirs: z.enum(["true", "false"]).optional(),
          type: z.enum(["file", "directory"]).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query").query
        const dirs = c.req.valid("query").dirs
        const type = c.req.valid("query").type
        const limit = c.req.valid("query").limit
        const results = await File.search({
          query,
          limit: limit ?? 10,
          dirs: dirs !== "false",
          type,
        })
        return c.json(results)
      },
    )
    .get(
      "/find/symbol",
      describeRoute({
        summary: "Find symbols",
        description: "Search for workspace symbols like functions, classes, and variables using LSP.",
        operationId: "find.symbols",
        responses: {
          200: {
            description: "Symbols",
            content: {
              "application/json": {
                schema: resolver(LSP.Symbol.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          query: z.string(),
        }),
      ),
      async (c) => {
        /*
      const query = c.req.valid("query").query
      const result = await LSP.workspaceSymbol(query)
      return c.json(result)
      */
        return c.json([])
      },
    )
    .post(
      "/file/mkdir",
      describeRoute({
        summary: "Create directory",
        description: "Create a new directory at the specified path.",
        operationId: "file.mkdir",
        responses: {
          200: {
            description: "Directory created",
            content: {
              "application/json": {
                schema: resolver(z.object({ path: z.string() })),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const { path: dirPath } = c.req.valid("json")
        const { mkdir } = await import("node:fs/promises")
        const nodePath = await import("node:path")
        const { Instance } = await import("../../project/instance")
        const resolved = nodePath.default.join(Instance.directory, dirPath)
        if (!Instance.containsPath(resolved)) {
          return c.json({ error: "Access denied: path escapes project directory" }, 403)
        }
        await mkdir(resolved, { recursive: true })
        const gitResult = await git(["init"], { cwd: resolved })
        return c.json({ path: resolved, gitInitialized: gitResult.exitCode === 0 })
      },
    )
    .get(
      "/file",
      describeRoute({
        summary: "List files",
        description: "List files and directories in a specified path.",
        operationId: "file.list",
        responses: {
          200: {
            description: "Files and directories",
            content: {
              "application/json": {
                schema: resolver(File.Node.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.list(path)
        return c.json(content)
      },
    )
    .get(
      "/file/content",
      describeRoute({
        summary: "Read file",
        description: "Read the content of a specified file.",
        operationId: "file.read",
        responses: {
          200: {
            description: "File content",
            content: {
              "application/json": {
                schema: resolver(File.Content),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          path: z.string(),
        }),
      ),
      async (c) => {
        const path = c.req.valid("query").path
        const content = await File.read(path)
        return c.json(content)
      },
    )
    .get(
      "/file/status",
      describeRoute({
        summary: "Get file status",
        description: "Get the git status of all files in the project.",
        operationId: "file.status",
        responses: {
          200: {
            description: "File status",
            content: {
              "application/json": {
                schema: resolver(File.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const content = await File.status()
        return c.json(content)
      },
    )
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
        const full = nodePath.join(Instance.directory, c.req.valid("query").path)
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
    ),
)
