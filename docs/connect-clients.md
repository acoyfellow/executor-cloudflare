# Connecting agents

Your Executor is private (Cloudflare Access). Agents reach it with the Access
**service token** the stack creates — no browser involved.

Read the token's client id and secret from Alchemy state:

```sh
bunx alchemy state get --stack ExecutorCloudflare --stage <stage> --fqn ExecutorAgent
```

Store them once in a gitignored `.env.mcp` (used by the bridge and verify script):

```dotenv
CF_ACCESS_CLIENT_ID=<client-id>.access
CF_ACCESS_CLIENT_SECRET=<client-secret>
EXECUTOR_MCP_URL=https://executor.example.com/mcp
```

## Any stdio MCP client (Claude Code, Cursor, Pi, …)

`scripts/mcp-bridge.ts` is a zero-dependency stdio → HTTP bridge. It loads
`.env.mcp` and attaches the Access headers, so the client config holds no
secret. Point the client at the bridge with an absolute path to this repo:

```json
{
  "mcpServers": {
    "executor": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/executor-cloudflare/scripts/mcp-bridge.ts"],
      "lifecycle": "lazy"
    }
  }
}
```

The same bridge works for any client that launches a stdio MCP server.

## Server-side clients (a Worker, a hosted agent)

A server that fetches MCP endpoints itself does not need the bridge — it
attaches the headers directly. Point it at:

```text
https://executor.example.com/mcp
```

with two headers, stored in that client's encrypted credential store (never in
code):

```text
CF-Access-Client-Id:      <client-id>.access
CF-Access-Client-Secret:  <client-secret>
```

## Verify headless access

```sh
CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bun run scripts/verify-mcp.ts
```

Anonymous requests to `/` and `/mcp` still return `302` to Cloudflare Access.
