# Architecture

Executor runs on your Cloudflare account, private behind Cloudflare Access. Two
kinds of capability reach it, and they are deliberately kept apart.

## Two planes, kept separate

```text
agents ──▶ <your-host>/mcp ──▶ catalog tools   (the work)
                                 cloudflare.*    (curated GET-only example)
                                 executor.*      (catalog mgmt, approval-gated)

operator ▶ scripts/self-edit-mcp.ts ▶ edit repo + redeploy   (change the system)
```

### Catalog plane (inside Executor)

Normal tools live in the Executor catalog and run in Executor's sandbox. They
can call APIs they are connected to. They **cannot** edit this repo or redeploy
the Worker — the sandbox has no filesystem or deploy access, and no deploy tool
exists in the catalog.

The example integration is `cloudflare` — a curated, **GET-only** slice of the
Cloudflare API (`integrations/cloudflare-readonly.openapi.json`). It is
read-only by construction: no create/update/delete operations exist in the
spec, so an agent cannot mutate the account through it even if it tried. Adding
it requires a read-only Cloudflare API token entered in the Executor UI; the
token is stored server-side and never passes through an agent or this repo.

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

> Advanced (not shipped here): the self-edit server can also be exposed *as a
> catalog tool* by running it over HTTP behind an authenticated tunnel and
> registering it with `executor.mcp.addServer`. Because the tool is marked
> destructive, Executor pauses every call for explicit operator approval before
> it runs. This collapses the two-plane boundary on purpose and should only be
> done with that approval gate, repo confinement, and an authenticated
> endpoint. This example keeps the planes separate by default.

## Auth

- Browser users: Cloudflare Access (email policy).
- Headless agents/CLIs: Cloudflare Access **service token**
  (`CF-Access-Client-Id` / `-Secret`); see `connect-clients.md`.
- Integration credentials (e.g. a read-only Cloudflare API token): entered by
  the operator in the Executor web UI via a connection handoff, stored
  server-side, never through an agent or this repo.

## A note on unattended self-modification

In this example the operator is the gate: the operator plane runs only when
invoked, and a human reads the result. Putting self-edit on a schedule
(unattended self-modification) would need a verification/proof step so a change
cannot be applied while misreporting success. That is out of scope here.
