import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import { loadConfig } from './src/config.ts';

const config = loadConfig();
const executorRoot = './vendor/executor/apps/host-cloudflare';

export default Alchemy.Stack(
  'ExecutorCloudflare',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const database = Cloudflare.D1Database('ExecutorDatabase', {
      name: 'executor',
    });
    const blobs = Cloudflare.R2Bucket('ExecutorBlobs', {
      name: 'executor-blobs',
    });
    const sessions = Cloudflare.DurableObjectNamespace<any>('ExecutorSessions', {
      className: 'McpSessionDO',
    });

    const encryptionKey = yield* Alchemy.Random('ExecutorEncryptionKey', {
      bytes: 32,
    });
    const accessPolicy = yield* Cloudflare.AccessPolicy('ExecutorUser', {
      name: `Executor — ${config.allowedEmail}`,
      decision: 'allow',
      include: [{ email: { email: config.allowedEmail } }],
    });

    // Headless clients (agents, CLIs) authenticate with
    // CF-Access-Client-Id / CF-Access-Client-Secret instead of a browser.
    const agentToken = yield* Cloudflare.AccessServiceToken('ExecutorAgent', {
      name: 'executor-agent',
    });
    const agentPolicy = yield* Cloudflare.AccessPolicy('ExecutorAgentPolicy', {
      name: 'Executor — agent service token',
      decision: 'non_identity',
      include: [{ serviceToken: { tokenId: agentToken.serviceTokenId } }],
    });

    const accessApplication = yield* Cloudflare.AccessApplication('ExecutorAccess', {
      type: 'self_hosted',
      name: 'Executor',
      domain: config.hostname,
      policies: [accessPolicy.policyId, agentPolicy.policyId],
    });

    const worker = yield* Cloudflare.Worker('Executor', {
      name: 'executor',
      main: `${executorRoot}/src/worker.ts`,
      assets: {
        directory: `${executorRoot}/dist`,
        notFoundHandling: 'single-page-application',
        runWorkerFirst: ['/api/*', '/mcp', '/mcp/*'],
      },
      compatibility: {
        date: '2025-04-01',
        flags: ['nodejs_compat'],
      },
      url: false,
      subdomain: {
        enabled: false,
        previewsEnabled: false,
      },
      domain: config.hostname,
      observability: {
        enabled: true,
      },
      env: {
        DB: database,
        VITE_PUBLIC_SITE_URL: `https://${config.hostname}`,
        BLOBS: blobs,
        MCP_SESSION: sessions,
        EXECUTOR_SECRET_KEY: encryptionKey.text,
        ACCESS_AUD: accessApplication.aud,
        ACCESS_TEAM_DOMAIN: config.accessTeamDomain,
        ACCESS_NAME_CLAIM: 'name',
        ACCESS_GROUPS_CLAIM: 'groups',
        ADMIN_EMAILS: config.allowedEmail,
        SELF_HOSTED_ORG_ID: 'default',
        SELF_HOSTED_ORG_NAME: 'Default',
      },
    });

    return {
      url: `https://${config.hostname}`,
      mcpUrl: `https://${config.hostname}/mcp`,
      workerName: worker.workerName,
      accessApplicationId: accessApplication.applicationId,
      agentClientId: agentToken.clientId,
    };
  }),
);
