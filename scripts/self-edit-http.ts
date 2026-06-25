// HTTP (streamable) MCP server exposing self_edit, so Executor's catalog can
// call it. This is how you put the gateway's ability to rewrite itself into the
// catalog (autonomy ladder rung 2): an agent calls self_edit through the public
// MCP endpoint, and because the tool is marked destructive, Executor pauses
// every call for explicit operator approval before it runs.
//
// Bearer-guarded: only requests carrying SELF_EDIT_TOKEN are served. Run it
// behind an authenticated tunnel (see docs/self-edit.md), then register it with
// executor.mcp.addServer.
//
// Env:
//   SELF_EDIT_TOKEN   required shared secret (Authorization: Bearer <token>)
//   SELF_EDIT_PORT    default 8791

import { selfEdit, selfEditTool } from './self-edit-core.ts';

const token = process.env.SELF_EDIT_TOKEN?.trim();
if (!token) {
  console.error('self-edit-http: set SELF_EDIT_TOKEN');
  process.exit(1);
}
const port = Number(process.env.SELF_EDIT_PORT || 8791);

function rpc(id: unknown, result?: unknown, error?: unknown) {
  const body: any = { jsonrpc: '2.0', id: id ?? null };
  if (error) body.error = error;
  else body.result = result;
  return Response.json(body);
}

async function dispatch(req: any): Promise<Response> {
  const { id, method } = req;
  if (method === 'initialize') {
    return rpc(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'executor-self-edit', version: '0.0.1' },
    });
  }
  if (method?.startsWith('notifications/')) return new Response(null, { status: 202 });
  if (method === 'tools/list') return rpc(id, { tools: [selfEditTool] });
  if (method === 'tools/call') {
    if (req.params?.name !== 'self_edit') {
      return rpc(id, undefined, { code: -32601, message: 'Unknown tool' });
    }
    try {
      const text = await selfEdit(req.params?.arguments ?? {});
      return rpc(id, { content: [{ type: 'text', text }] });
    } catch (e) {
      return rpc(id, { content: [{ type: 'text', text: `error: ${String(e)}` }], isError: true });
    }
  }
  return rpc(id, undefined, { code: -32601, message: `Unknown method: ${method}` });
}

Bun.serve({
  port,
  idleTimeout: 240,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/mcp') return new Response('not found', { status: 404 });

    const hasAuth = (request.headers.get('authorization') || '') === `Bearer ${token}`;
    console.error(`[self-edit-http] ${request.method} /mcp auth=${hasAuth ? 'ok' : 'MISSING'}`);
    if (!hasAuth) return new Response('unauthorized', { status: 401 });
    if (request.method === 'GET') return new Response(null, { status: 405 });
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return rpc(null, undefined, { code: -32700, message: 'parse error' });
    }
    return dispatch(body);
  },
});

console.error(`self-edit-http listening on :${port} (POST /mcp, bearer-guarded)`);
