# Executor on Cloudflare

Deploy [Executor](https://github.com/RhysSullivan/executor) (an open-source
integration layer for AI agents) to your own Cloudflare account, private behind
Cloudflare Access, and update its version remotely. Uses
[Alchemy](https://github.com/alchemy-run/alchemy-effect) to declare the resource
graph, including the Access application and policy.

- Deploy the whole graph with one command; private once `bun run verify` passes.
- Agents and CLIs reach `/mcp` with an Access service token, no browser.
- Update the pinned Executor version through the gateway, approval-gated.

## Updating Executor's version

The Executor version is pinned in `scripts/bootstrap.ts`. Updating means changing
that pin and redeploying. Two ways:

```sh
# From the machine: override the pin and redeploy.
EXECUTOR_REVISION=<full-commit-sha> bun run deploy
```

Remotely: `self_edit`, a tool on the gated `/mcp` endpoint, changes the pin in
`scripts/bootstrap.ts`, rebuilds that revision, and redeploys. An update can come
from any client that can reach the endpoint, not just the deploy machine.
Every `self_edit` call is approval-gated. Walkthrough:
[`docs/self-edit.md`](docs/self-edit.md).

`self_edit` edits any file in this repo and redeploys, so it covers more than
version bumps, but version updates are its purpose. Across an update, D1, R2, the
Durable Object, the secret, the hostname, and Access are preserved.

## What deploy sets up

One command provisions the whole graph in code, so there's no "deploy, copy the
Access audience by hand, deploy again" step. All resources are created in **your**
account (deployment still pulls from GitHub and npm):

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
(git-ignored). Re-running with unchanged config reuses the data resources; the
Worker and assets may update. Review the plan before applying; changed config or
lost Alchemy state can replace resources.

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
`.env.mcp` (no browser). The client id/secret are a bearer credential to the
endpoint; anyone holding them gets the same access. See
[`docs/connect-clients.md`](docs/connect-clients.md). Quick check:

```sh
bun --env-file=.env.mcp run scripts/verify-mcp.ts
# -> Headless MCP initialize succeeded (200). No browser involved.
```

## Architecture

See [`docs/architecture.md`](docs/architecture.md). Both ordinary catalog tools
and `self_edit` are reached through the one Access-protected `/mcp` ingress; they
differ in authority, not route:

```text
agents --> <your-host>/mcp --> catalog tools   (only call what they connect to)
                                 self_edit       (changes the deploy; approval-gated)
operator --> self-edit (local) --> edit pin + rebuild + redeploy
```

`self_edit` rejects paths resolving outside this repo (tested) and requires a
bearer token. Deployment runs code from this repo, so repo-write is effectively
code execution with the deploy process's Cloudflare credentials. The path check
and approval prompt are controls, not a sandbox. There is no auto-approve mode.

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
  is never relied on for privacy. Access admits a client but doesn't authorize
  individual tools.
- Catalog tools get only their configured bindings; they have no deploy path.
- `self_edit` is high-authority (repo write plus deploy), guarded by a path
  check, a bearer token, and an approval prompt, not a sandbox.
- Don't commit `.env`, `.env.mcp`, or Alchemy state. Treat MCP arguments and
  `self_edit` diffs as sensitive in logs. See [`SECURITY.md`](SECURITY.md).

## Limitations

- An example, not a product; use a non-production account until you've reviewed it.
- Treat `destroy` as destructive; D1/R2/Access retention isn't fully characterized.
- Pins one Executor revision and one Alchemy version.
- No unattended self-edit, and no production observability or scale envelope.
- Setup is tested on macOS/Linux; Windows is untested (use WSL).

## Layout

```text
alchemy.run.ts         resource graph (Worker, D1, R2, DO, secret, Access)
src/config.ts          validated .env inputs
scripts/bootstrap.ts   pin + build vendored Executor (the version lives here)
scripts/verify*.ts     anonymous-access + headless-MCP checks
scripts/mcp-bridge.ts  stdio-to-HTTP bridge for local MCP clients
scripts/self-edit-*    edit-and-redeploy tool (core, local stdio, catalog HTTP)
docs/ · test/          architecture/self-edit/connect · config + boundary tests
```

## License

MIT
