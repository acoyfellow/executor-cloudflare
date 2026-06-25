# Executor on Cloudflare

Deploy [Executor](https://github.com/RhysSullivan/executor) (an open-source
integration layer for AI agents) to your own Cloudflare account in one command,
private behind Cloudflare Access. Uses
[Alchemy](https://github.com/alchemy-run/alchemy-effect) to declare the resource
graph, including the Access application and policy.

It also includes `self_edit`: a tool that edits this repo and redeploys. Exposed
through the MCP endpoint, every call pauses for explicit approval before it runs.

- One command deploys everything, private by default.
- Agents and CLIs reach `/mcp` with an Access service token — no browser.
- `self_edit` can change the running deployment, gated by approval.

## What it addresses

Getting software like Executor running privately on Cloudflare has three rough
edges. This repo handles each:

- **Deploy.** One command provisions the whole graph — Worker, D1, R2, Durable
  Object, secret, hostname, and the Access application and policy — in code. No
  deploy, copy the Access audience by hand, then deploy again.
- **Auth.** Browsers sign in through Access; agents and CLIs use an Access
  service token against the same `/mcp`. No separate login.
- **Updates.** The Executor version is pinned. Updating is bump-revision then
  redeploy; D1, R2, the Durable Object, the secret, the hostname, and Access
  are preserved.

## self_edit

`self_edit` edits a file in this repo and redeploys. It runs two ways:

- **Local:** a stdio MCP server you invoke from your machine.
- **Through the catalog:** registered as an MCP server so an agent can call it
  via the public endpoint. It is marked destructive, so Executor pauses for
  approval on every call.

It is confined to this repo (paths outside it are refused — tested) and
bearer-guarded. There is no unattended/auto-approve mode; running on a schedule
would need a post-deploy verification step first. Detail:
[`docs/self-edit.md`](docs/self-edit.md).

## What it creates

All in **your** account; nothing hosted elsewhere.

| Resource | Purpose |
|---|---|
| Worker + web assets | console, API, `/mcp` endpoint |
| D1 | application data |
| R2 | specs and plugin blobs |
| Durable Object | MCP sessions |
| Encryption secret | at-rest key (generated; Worker secret) |
| Custom hostname | stable origin you own |
| Access app + email policy | browser sign-in |
| Access service token + policy | headless agents/CLIs |

`workers.dev` and preview URLs are off.

## Architecture

Two planes, kept apart — see [`docs/architecture.md`](docs/architecture.md):

```text
agents --> <your-host>/mcp --> catalog tools   (sandboxed; cannot deploy)
                                 self_edit       (gated; rewrites + redeploys)
operator --> self-edit (local) --> edit repo + redeploy
```

Catalog tools run sandboxed and only call what they're connected to. `self_edit`
is the exception: it can deploy, so it is marked destructive and Executor pauses
for approval before running it.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- A Cloudflare account with Workers, D1, R2, Durable Objects, and Zero Trust
- A hostname in a zone on that account (e.g. `executor.example.com`)
- A Zero Trust team domain (e.g. `your-team.cloudflareaccess.com`)

## Setup (~5 min)

```sh
git clone https://github.com/acoyfellow/executor-cloudflare
cd executor-cloudflare
bun install
cp .env.example .env   # set hostname, allowed email, team domain
bunx alchemy login
bun run deploy
```

`deploy` checks out the pinned Executor commit under `vendor/`, builds it, and
applies the stack:

```text
Done: 8 succeeded
{ url: "https://executor.example.com", mcpUrl: ".../mcp", ... }
```

Re-running is a no-op for data resources (only the Worker updates).

## Verify

```sh
bun run verify
```

```text
Anonymous request blocked by Cloudflare Access (302).
```

Then open the URL, sign in with the allowed email, and use the console.

## Connect an agent

Agents reach `/mcp` with the Access **service token** the stack created — no
browser. See [`docs/connect-clients.md`](docs/connect-clients.md). Quick check:

```sh
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bun run scripts/verify-mcp.ts
# -> Headless MCP initialize succeeded (200). No browser involved.
```

## Update

```sh
EXECUTOR_REVISION=<full-commit-sha> bun run deploy
```

Replaces the Worker and assets; leaves D1, R2, Durable Object, secret, hostname,
and Access in place.

## Teardown

```sh
bun run destroy   # can delete D1/R2 data — don't run it on data you need
```

## Development

```sh
bun run check   # tests + typecheck, no Cloudflare credentials needed
```

`vendor/`, `.env`, `.env.mcp`, and Alchemy state are git-ignored.

## Security

- Private behind Cloudflare Access; an unguessable URL is never relied on for privacy.
- Sandboxed catalog tools can't deploy or edit the repo.
- `self_edit` is repo-confined, bearer-guarded, and approval-gated; there is no
  auto-approve mode.
- Secrets live as Worker secrets, in Alchemy state, or in Executor's server-side
  store — never committed. See [`SECURITY.md`](SECURITY.md).

## Limitations

- An example, not a product — use a non-production account until you've reviewed it.
- Treat `destroy` as destructive; D1/R2/Access retention isn't fully characterized.
- Pins one Executor revision and one Alchemy version.
- No unattended self-edit: scheduling it would need a post-deploy verification
  step that isn't built here.

## Layout

```text
alchemy.run.ts         resource graph (Worker, D1, R2, DO, secret, Access)
src/config.ts          validated .env inputs
scripts/bootstrap.ts   pin + build vendored Executor
scripts/verify*.ts     anonymous-access + headless-MCP checks
scripts/mcp-bridge.ts  stdio-to-HTTP bridge for local MCP clients
scripts/self-edit-*    repo-confined self-edit (core, local stdio, catalog HTTP)
docs/ · test/          architecture/self-edit/connect · config + boundary tests
```

## License

MIT
