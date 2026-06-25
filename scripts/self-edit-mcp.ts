// Local stdio MCP server exposing the self_edit tool to a local client (Pi).
// Operator plane: confined to this repo, gated by the operator who runs it.

import { selfEdit, selfEditTool } from './self-edit-core.ts';

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handle(line: string): Promise<void> {
  let req: any;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method } = req;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'executor-self-edit', version: '0.0.1' },
      },
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: [selfEditTool] } });
    return;
  }
  if (method === 'tools/call') {
    if (req.params?.name !== 'self_edit') {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool` } });
      return;
    }
    try {
      const text = await selfEdit(req.params?.arguments ?? {});
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
    } catch (e) {
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `error: ${String(e)}` }], isError: true },
      });
    }
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
  }
}

let buffer = '';
let chain: Promise<void> = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i: number;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (line) chain = chain.then(() => handle(line)).catch(() => {});
  }
});
process.stdin.on('end', async () => {
  await chain;
  process.exit(0);
});
