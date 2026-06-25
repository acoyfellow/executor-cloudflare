const hostname = process.env.EXECUTOR_HOSTNAME?.trim();
if (!hostname) throw new Error('Set EXECUTOR_HOSTNAME before running verify.');

const appOrigin = `https://${hostname}`;
const response = await fetch(appOrigin, { redirect: 'manual' });
const redirectLocation = response.headers.get('location') || '';

if (response.status < 300 || response.status >= 400) {
  throw new Error(`Anonymous request reached the app: ${response.status}`);
}
if (!redirectLocation.includes('cloudflareaccess.com')) {
  throw new Error(`Expected an Access redirect, received ${response.status} ${redirectLocation}`);
}

console.log(`Anonymous request blocked by Cloudflare Access (${response.status}).`);
console.log(`Open ${appOrigin} in a browser to verify the signed-in experience.`);
console.log(`MCP endpoint: ${appOrigin}/mcp`);

export {};

// Headless MCP check (run manually with service-token env vars):
//   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... bun scripts/verify-mcp.ts
