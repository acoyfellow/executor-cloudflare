# Architecture

Executor runs on your Cloudflare account, private behind Cloudflare Access. Two
kinds of capability reach it, and they are deliberately kept apart.

## Two planes, kept separate

```text
agents --> <your-host>/mcp --> catalog tools   (the work)
                                 self_edit       (gated; rewrites + redeploys)
                                 executor.*      (catalog mgmt, approval-gated)

operator --> scripts/self-edit-mcp.ts --> edit repo + redeploy   (change the system)
```

### Catalog plane (inside Executor)

Normal tools live in the Executor catalog and run in Executor's sandbox. They
can call APIs they are connected to. They **cannot** edit this repo or redeploy
the Worker — the sandbox has no filesystem or deploy access, and no deploy tool
exists in the catalog.

You connect whatever tools you want into the catalog (OpenAPI specs, other MCP
servers, OAuth integrations) from the Executor console. The one this repo ships
is self-edit (below) — the gateway's ability to rewrite itself.

Catalog management tools (`executor.openapi.addSpec`,
`executor.coreTools.connections.*`) are themselves approval-gated by Executor:
adding a source or connection pauses for explicit acceptance.

### Operator plane (outside Executor)

`scripts/self-edit-mcp.ts` is a separate, local stdio MCP server that can edit
this repo and redeploy. It is **not** in the Executor catalog and is not
reachable through the public endpoint. It runs only on the operator's machine,
wired to a local MCP client the operator controls, and is confined to this repo
— paths that escape the repo root are refused (`test/self-edit.test.ts`).

This separation is the safety model:

- A confused or compromised catalog tool can read what it is connected to, but
  cannot change the system or deploy.
- Changing the system requires the operator plane, which lives on the
  operator's machine, not behind the public endpoint.

> The self-edit server can also be exposed *as a catalog tool*: run it over HTTP
> behind an authenticated tunnel and register it with `executor.mcp.addServer`.
> Because the tool is marked destructive, Executor pauses every call for operator
> approval before it runs. This crosses the two-plane boundary on purpose, with
> the approval gate, repo confinement, and an authenticated endpoint as the
> controls. See [`self-edit.md`](self-edit.md).

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
