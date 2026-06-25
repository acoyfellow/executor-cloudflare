const hostname = process.env.EXECUTOR_HOSTNAME?.trim();
const id = process.env.CF_ACCESS_CLIENT_ID?.trim();
const secret = process.env.CF_ACCESS_CLIENT_SECRET?.trim();
if (!hostname || !id || !secret) {
  throw new Error('Set EXECUTOR_HOSTNAME, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET.');
}

const response = await fetch(`https://${hostname}/mcp`, {
  method: 'POST',
  headers: {
    'CF-Access-Client-Id': id,
    'CF-Access-Client-Secret': secret,
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'verify-mcp', version: '0.0.1' },
    },
  }),
});

const body = await response.text();
if (response.status !== 200 || !body.includes('serverInfo')) {
  throw new Error(`Headless MCP failed: ${response.status} ${body.slice(0, 200)}`);
}
console.log(`Headless MCP initialize succeeded (${response.status}). No browser involved.`);

export {};
