# Workspaces

OpenCode can group multiple directories under one project so you can work in parallel without mixing changes.

This behavior is controlled by the `Enable workspaces` toggle in the app/web sidebar.

---

## Turn It On

When enabled, the sidebar shows a workspace list under a project instead of treating every directory as a separate top-level entry.

The setting is persisted per project root directory in the app's layout state:

- Stored in the UI's persisted layout store as `sidebar.workspaces[projectRoot]` with a `workspacesDefault` fallback.
- Only enabled for git projects in the UI (non-git projects can't newly enable it).

Evidence: `packages/app/src/context/layout.tsx` (`sidebar.workspaces`, `workspacesDefault`) and `packages/app/src/pages/layout.tsx` (`toggleProjectWorkspaces`, `workspacesEnabled`).

---

## Understand The Pieces

OpenCode uses a few similar-sounding words. This is the mapping used by the UI and the local server.

- Project: logical grouping of work under one repo identity (`Project.id`), with one primary directory plus zero or more sandboxes.
  - Evidence: `packages/opencode/src/project/project.ts`, `packages/opencode/src/project/project.sql.ts`
- Workspace (directory): a concrete directory on disk that OpenCode operates within.
  - Either the primary checkout (`project.worktree`) or a sandbox directory (a git worktree checkout).
  - Evidence: `packages/app/src/pages/layout.tsx` (`workspaceIds`)
- Sandbox: a workspace directory that is not the primary checkout.
  - Backed by a git worktree and typically paired with its own branch.
  - Evidence: `packages/opencode/src/worktree/index.ts`, `packages/opencode/src/project/project.ts`
- Session: a conversation thread with the agent.
  - Belongs to exactly one workspace via `session.directory`.
  - Evidence: `packages/app/src/pages/layout/helpers.ts` (`isRootVisibleSession`), `packages/opencode/src/server/routes/session.ts` (`directory` filter)
- Instance: a per-directory runtime container on the server (state + caches).
  - Selected on each request by the scoped `directory`.
  - Evidence: `packages/opencode/src/server/server.ts` (directory scoping), `packages/opencode/src/project/instance.ts`

---

## Directories And Keys

With the toggle enabled, the UI computes a workspace list for the selected project like this:

```
project.worktree (primary)
+ project.sandboxes[] (sandboxes)
+ maybe the currently-open directory (if it isn't listed yet)
```

The list is produced by `workspaceIds(project)` and normalized with `workspaceKey(directory)` to avoid duplicates from trailing slashes or Windows drive roots.

Evidence: `packages/app/src/pages/layout.tsx` (`workspaceIds`) and `packages/app/src/pages/layout/helpers.ts` (`workspaceKey`).

---

## Create A Sandbox Workspace

Creating a new workspace from the UI calls the server's worktree-create endpoint and then navigates into the new directory.

On the server, a sandbox is created as a git worktree plus a new branch:

- Directory root: `Global.Path.data/worktree/<projectID>/...`
- Branch format: `opencode/<name>`
- Git command: `git worktree add --no-checkout -b <branch> <directory>`
- Sandboxes are recorded on the project: `Project.addSandbox(projectID, directory)`

Evidence: `packages/opencode/src/worktree/index.ts` (`Worktree.create`) and `packages/opencode/src/server/routes/experimental.ts` (`POST /experimental/worktree`).

A simplified view:

```
Project (id)
|-- primary:   <repo top-level>
`-- sandbox:   <data>/worktree/<id>/<name>   (branch: opencode/<name>)
```

---

## Reset Or Delete A Sandbox

Reset and delete are lifecycle operations for sandbox workspaces only, not the primary directory.

### Reset

Reset is designed to start fresh in a sandbox directory.

What the UI does first:

- Lists sessions for that workspace directory.
- Clears UI terminal state for those sessions.
- Calls `POST /instance/dispose` scoped to that directory to drop runtime resources.
- Calls the worktree reset endpoint.
- Archives existing sessions in that directory (sets `time.archived`).

Evidence: `packages/app/src/pages/layout.tsx` (`resetWorkspace`) and `packages/opencode/src/server/server.ts` (`/instance/dispose`).

What the server reset does (git details):

- Refuses to reset the primary workspace.
- Chooses a default branch target, preferring a remote HEAD (typically `origin/<default>`).
- Runs `git reset --hard <target>` in the sandbox directory.
- Runs a deep clean (`git clean -ffdx`) and submodule reset/clean.
- Fails if the sandbox is left dirty after reset.

Evidence: `packages/opencode/src/worktree/index.ts` (`Worktree.reset`).

### Delete

Delete removes the sandbox directory and its branch.

What the server delete does:

- Locates the worktree entry via `git worktree list --porcelain`.
- Runs `git worktree remove --force <path>`.
- Removes the directory on disk.
- Deletes the associated branch: `git branch -D <branch>`.

Evidence: `packages/opencode/src/worktree/index.ts` (`Worktree.remove`) and `packages/opencode/src/server/routes/experimental.ts` (`DELETE /experimental/worktree`).

---

## How Sessions Attach To Workspaces

A session is in a workspace if `session.directory` matches that workspace directory.

The UI uses this directory tie to decide what to show under a workspace and what to archive during reset.

Evidence:

- UI root visibility filter: `packages/app/src/pages/layout/helpers.ts` (`isRootVisibleSession`)
- Server filtering: `packages/opencode/src/server/routes/session.ts` (`GET /session?directory=...`)

---

## Runtime Scoping (Processes, Memory, Etc.)

OpenCode runs one local server process, but it keeps separate runtime state per directory.

Each HTTP request is scoped to a directory using either:

- `?directory=<path>` query param, or
- `x-opencode-directory: <path>` header

The server wraps the request in `Instance.provide({ directory, ... })`, which caches a per-directory instance context.

Evidence: `packages/opencode/src/server/server.ts` (directory scoping middleware) and `packages/opencode/src/project/instance.ts` (`Instance.provide`).

Mental model:

```
HTTP request (directory=/path/A)
        |
        v
Instance cache key: "/path/A"
        |
        v
Per-directory resources + caches
```

### What Lives Per Instance

Several heavyweight resources are created via `Instance.state(...)`, so they naturally separate by directory and get disposed together:

- PTY sessions and sockets: `packages/opencode/src/pty/index.ts`
- LSP client/server state: `packages/opencode/src/lsp/index.ts`
- File watchers: `packages/opencode/src/file/watcher.ts`
- Prompt in-flight state (abort controllers, callbacks): `packages/opencode/src/session/prompt.ts`

Disposing an instance means:

- Running all `Instance.state` disposers for that directory.
- Dropping the instance from the cache.
- Emitting a `server.instance.disposed` event.

Evidence: `packages/opencode/src/project/instance.ts` (`Instance.dispose`) and `packages/opencode/src/server/server.ts` (`POST /instance/dispose`).

---

## Storage And Persistence

Two different persistence layers are involved: UI layout state and server-side storage.

### UI State (Layout + Preferences)

The `Enable workspaces` toggle is stored in persisted layout state under the sidebar config.

Evidence: `packages/app/src/context/layout.tsx` (`Persist.global("layout", ...)`, `sidebar.workspaces`, `workspacesDefault`).

### Server Storage (Sessions And Project Data)

Session and project data are stored on disk under the OpenCode data directory.

For the on-disk layout and platform-specific paths, see `packages/web/src/content/docs/troubleshooting.mdx`.

---

## Security Notes

Directory scoping is not just UX, it's also part of the permission boundary.

The server uses the active instance directory (and, for git projects, the primary worktree directory) to decide whether a path is inside the allowed project boundary.

Evidence: `packages/opencode/src/project/instance.ts` (`Instance.containsPath(...)` and its comment about external directory permissions).

This matters because:

- A sandbox should be able to operate on repo files without being treated as external.
- A request scoped to one directory should not automatically grant access to unrelated directories.

---

## Appendix: Evidence Index

### UI: Toggle + Session Grouping

- `packages/app/src/context/layout.tsx`
  - Persisted layout state: `sidebar.workspaces`, `workspacesDefault`
  - Accessors/mutators: `workspaces(directory)`, `toggleWorkspaces(directory)`
- `packages/app/src/pages/layout.tsx`
  - Gate: `workspacesEnabled()`
  - Toggle: `toggleProjectWorkspaces(project)`
  - Workspace list: `workspaceIds(project)`
  - Lifecycle: `createWorkspace`, `resetWorkspace`, `deleteWorkspace`
- `packages/app/src/pages/layout/helpers.ts`
  - Normalization: `workspaceKey(directory)`
  - Session visibility: `isRootVisibleSession(session, directory)`

### Server: Directory Scoping + Instance Lifecycle

- `packages/opencode/src/server/server.ts`
  - Directory scoping middleware reads `?directory=` or `x-opencode-directory`
  - Instance wrapper: `Instance.provide({ directory, init: InstanceBootstrap, fn: ... })`
  - Dispose endpoint: `POST /instance/dispose`
- `packages/opencode/src/project/instance.ts`
  - Per-directory instance cache and disposal: `Instance.provide`, `Instance.dispose`, `Instance.state`
  - Boundary helper: `Instance.containsPath(filepath)`

### Worktrees (Sandboxes)

- `packages/opencode/src/server/routes/experimental.ts`
  - `POST /experimental/worktree` (create)
  - `DELETE /experimental/worktree` (remove)
  - `POST /experimental/worktree/reset` (reset)
- `packages/opencode/src/worktree/index.ts`
  - Implements create/remove/reset using git worktree commands

### Sessions

- `packages/opencode/src/server/routes/session.ts`
  - `GET /session?directory=...` filters sessions by workspace directory

### Per-Instance Runtime Resources

- `packages/opencode/src/pty/index.ts`
- `packages/opencode/src/lsp/index.ts`
- `packages/opencode/src/file/watcher.ts`
- `packages/opencode/src/session/prompt.ts`
