# Architecture

Executor runs on your Cloudflare account, private behind Cloudflare Access. Two
kinds of capability reach it, and they are deliberately kept apart.

## Two planes

```text
agents --> <your-host>/mcp --> catalog tools          (sandboxed; can't deploy)
                               executor.*             (catalog mgmt, gated)
                               self_edit (registered) --> deploy-machine server
operator ------------------------------------------> same server, called directly
                                                       (edit pin, rebuild, redeploy)
```

### Catalog plane (inside Executor)

Built-in catalog tools run in Executor's sandbox. They can call APIs they are
connected to. They **cannot** edit this repo or redeploy the Worker: the sandbox
has no filesystem or deploy access.

You connect whatever tools you want into the catalog (OpenAPI specs, other MCP
servers, OAuth integrations) from the Executor console. `self_edit` is one of
those connected servers (below). It does not run in the sandbox; Executor only
*calls* it. The deploy itself happens on the machine running that server.

Catalog management tools (`executor.openapi.addSpec`,
`executor.coreTools.connections.*`) are themselves approval-gated by Executor:
adding a source or connection pauses for explicit acceptance.

### Operator plane (outside Executor)

`self_edit` edits this repo, rebuilds the pinned Executor revision, and
redeploys. It always runs on the machine that holds the repo and Cloudflare
credentials, because the Worker cannot deploy itself. It is confined to this repo
(paths that escape the repo root are refused, `test/self-edit.test.ts`). Two ways
to reach it:

- **Local:** `scripts/self-edit-mcp.ts`, a stdio server you call from a local MCP
  client. Not registered with Executor, not reachable from the endpoint.
- **Registered:** `scripts/self-edit-http.ts` behind an authenticated tunnel,
  registered with `executor.mcp.addServer`, so Executor can call it through
  `/mcp`. It is marked destructive, so Executor pauses every call for operator
  approval before dispatching. The build and redeploy still run on the server's
  machine, not in the Worker.

The controls are the same either way: repo confinement, a bearer token on the
HTTP server, and the approval prompt. None of them sandbox the deploy itself,
which runs with that machine's Cloudflare credentials.

## Auth

- Browser users: Cloudflare Access (email policy).
- Headless agents/CLIs: Cloudflare Access **service token**
  (`CF-Access-Client-Id` / `-Secret`); see `connect-clients.md`.
- Integration credentials (any tool you connect): entered by the operator in the
  Executor web UI via a connection handoff, stored server-side, never through an
  agent or this repo.

## How far to automate

`self_edit` can change the deployment. How much of that you automate is a
sequence of steps, each one depending on the control before it:

1. **Invoked** — you call `self_edit` and read the result.
2. **Gated** — an agent calls it through the public endpoint; it pauses for your
   approval before anything runs. This repo does 1 and 2.
3. **Verified** — a proof step runs after each change, so a broken deploy can't
   report success.
4. **Scheduled** — it runs unattended.

Don't run step 4 without step 3. The approval gate and repo confinement are what
make steps 1 and 2 safe; an unattended loop needs the verification in step 3
before it can be trusted the same way.
