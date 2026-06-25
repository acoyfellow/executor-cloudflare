# Executor on Cloudflare

Deploy [Executor](https://github.com/RhysSullivan/executor) (an open-source
integration layer for AI agents) to your own Cloudflare account with one deploy
command (after a short setup), private behind Cloudflare Access. Uses
[Alchemy](https://github.com/alchemy-run/alchemy-effect) to declare the resource
graph, including the Access application and policy.

It also includes `self_edit`: a tool that edits this repo and redeploys. When an
agent calls it through the MCP endpoint, Executor requests operator approval
before dispatching. That is an interaction safeguard, not an authorization
boundary; `self_edit` holds real deploy authority (see [self_edit](#self_edit)).

- One deploy command provisions everything; private once `bun run verify` passes.
- Agents and CLIs reach `/mcp` with an Access service token — no browser.
- `self_edit` can change the running deployment, with an approval prompt.

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

It rejects target paths that resolve outside this repo (tested) and requires a
bearer token. Note that deployment executes code from this repo, so repository
write access is effectively code execution with the deploy process's Cloudflare
credentials — the path check and approval prompt are controls, not a sandbox.
There is no auto-approve mode; running it unattended would need a post-deploy
verification step that isn't built here. Detail:
[`docs/self-edit.md`](docs/self-edit.md).

## What it creates

The runtime resources below are created in **your** account. (Deployment still
pulls from GitHub and npm.)

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

Both ordinary catalog tools and `self_edit` are reached through the one
Access-protected `/mcp` ingress; they differ in authority, not in route. Most
catalog tools only call what they're connected to. `self_edit` is the
high-authority exception: it can deploy, so it's marked destructive and Executor
requests approval before dispatching it.

## Prerequisites

- [Bun](https://bun.sh) 1.3+ and Git
- A Cloudflare account where you can create Workers, D1, R2, Durable Objects,
  Worker secrets, custom hostnames, and Zero Trust Access apps/policies/tokens
- A hostname in a zone on that account (e.g. `executor.example.com`)
- A Zero Trust team domain (e.g. `your-team.cloudflareaccess.com`)

## Setup

About 5 minutes once the prerequisites are ready (account enablement, Zero Trust
onboarding, and the first Executor build can take longer). POSIX shell; on
Windows use WSL.

```sh
git clone https://github.com/acoyfellow/executor-cloudflare
cd executor-cloudflare
bun install
cp .env.example .env   # then edit it; the variables and examples are in that file
bunx alchemy login
bun run deploy
```

`deploy` checks out the pinned Executor commit under `vendor/`, builds it, and
applies the stack:

```text
Done: 8 succeeded
{ url: "https://executor.example.com", mcpUrl: "https://executor.example.com/mcp" }
```

It also writes the generated Access service-token credentials to `.env.mcp`
(git-ignored). Re-running with unchanged config reuses D1, R2, the Durable
Object, secret, hostname, and Access; the Worker and assets may update. Review
the plan before applying — changed config or lost Alchemy state can replace
resources.

## Verify

```sh
bun run verify
```

```text
Anonymous request blocked by Cloudflare Access (302).
```

This only proves anonymous requests are turned away. Also open the URL in a
private window, sign in with the allowed email, and confirm the console loads.

## Connect an agent

Agents reach `/mcp` with the Access **service token** the stack wrote to
`.env.mcp` — no browser. The client id/secret are a bearer credential to the
Access endpoint; anyone holding them gets the same access. See
[`docs/connect-clients.md`](docs/connect-clients.md). Quick check:

```sh
bun --env-file=.env.mcp run scripts/verify-mcp.ts
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

- Cloudflare Access authenticates requests to the hostname; an unguessable URL
  is never relied on for privacy. Access admits a client but does not authorize
  individual tools.
- Catalog tools get only their configured bindings; they have no deploy path.
- `self_edit` is high-authority (repo write plus deploy). The path check, bearer
  token, and approval prompt are controls, not a sandbox; there is no
  auto-approve mode.
- Don't commit `.env`, `.env.mcp`, or Alchemy state. Treat MCP arguments and
  `self_edit` diffs as sensitive in logs. See [`SECURITY.md`](SECURITY.md).

## Limitations

- An example, not a product — use a non-production account until you've reviewed it.
- Treat `destroy` as destructive; D1/R2/Access retention isn't fully characterized.
- Pins one Executor revision and one Alchemy version.
- No unattended self-edit, and no production observability or scale envelope —
  add monitoring and load-test before relying on it.
- Setup commands are tested on macOS/Linux; Windows is untested (use WSL).

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
