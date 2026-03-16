import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Log } from "../../src/util/log"
import { Flag } from "../../src/flag/flag"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterAll(async () => {
  await Instance.disposeAll()
})

function headers(directory: string) {
  const result: Record<string, string> = {
    "x-opencode-directory": directory,
  }

  const password = Flag.OPENCODE_SERVER_PASSWORD
  if (!password) return result

  const username = Flag.OPENCODE_SERVER_USERNAME ?? "opencode"
  result.authorization = "Basic " + Buffer.from(username + ":" + password).toString("base64")
  return result
}

describe("POST /project/create", () => {
  test("creates a project under creative-fitting.root", async () => {
    await using home = await tmpdir()
    await using root = await tmpdir({
      config: {
        "creative-fitting": {
          root: "{env:CF_ROOT}",
        },
      },
    })

    const prevHome = process.env.OPENCODE_TEST_HOME
    const prevRoot = process.env.CF_ROOT
    process.env.OPENCODE_TEST_HOME = home.path
    process.env.CF_ROOT = root.path
    try {
      await Instance.provide({ directory: root.path, fn: async () => {} })
      const app = Server.App()

      const response = await app.request("/project/create", {
        method: "POST",
        headers: {
          ...headers(root.path),
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "my-script" }),
      })

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type") ?? "").toContain("application/json")
      const data = (await response.json()) as { path: string; name: string; gitInitialized: boolean }
      expect(data.name).toBe("my-script")
      expect(data.path).toBe(path.join(root.path, "my-script"))

      const ok = await fs
        .stat(path.join(root.path, "my-script", ".git"))
        .then(() => true)
        .catch(() => false)
      expect(data.gitInitialized).toBe(ok)

      // Verify initial commit exists so project.fromDirectory can derive a stable project ID
      if (ok) {
        const { $ } = await import("bun")
        const result = await $`git -C ${path.join(root.path, "my-script")} rev-list --max-parents=0 --all`.text()
        const roots = result.trim().split("\n").filter(Boolean)
        expect(roots.length).toBeGreaterThan(0)
      }
    } finally {
      process.env.OPENCODE_TEST_HOME = prevHome
      process.env.CF_ROOT = prevRoot
    }
  })

  test("returns 409 when project already exists", async () => {
    await using home = await tmpdir()
    await using root = await tmpdir({
      config: {
        "creative-fitting": {
          root: "{env:CF_ROOT}",
        },
      },
    })

    const prevHome = process.env.OPENCODE_TEST_HOME
    const prevRoot = process.env.CF_ROOT
    process.env.OPENCODE_TEST_HOME = home.path
    process.env.CF_ROOT = root.path
    try {
      await fs.mkdir(path.join(root.path, "exists"), { recursive: true })

      await Instance.provide({ directory: root.path, fn: async () => {} })
      const app = Server.App()

      const response = await app.request("/project/create", {
        method: "POST",
        headers: {
          ...headers(root.path),
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "exists" }),
      })

      expect(response.status).toBe(409)
      expect(response.headers.get("content-type") ?? "").toContain("application/json")
      const data = (await response.json()) as { error: string }
      expect(data.error).toBe("Project already exists")
    } finally {
      process.env.OPENCODE_TEST_HOME = prevHome
      process.env.CF_ROOT = prevRoot
    }
  })
})
