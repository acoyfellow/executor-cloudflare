const required = [
  'EXECUTOR_HOSTNAME',
  'EXECUTOR_ALLOWED_EMAIL',
  'ACCESS_TEAM_DOMAIN',
] as const;

export type Config = {
  hostname: string;
  allowedEmail: string;
  accessTeamDomain: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')}. Copy .env.example to .env and fill in the values.`,
    );
  }

  const hostname = env.EXECUTOR_HOSTNAME!.trim().toLowerCase();
  const allowedEmail = env.EXECUTOR_ALLOWED_EMAIL!.trim().toLowerCase();
  const accessTeamDomain = env.ACCESS_TEAM_DOMAIN!.trim().toLowerCase();

  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || !hostname.includes('.')) {
    throw new Error('EXECUTOR_HOSTNAME must be a hostname in a zone on the selected account.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(allowedEmail)) {
    throw new Error('EXECUTOR_ALLOWED_EMAIL must be one email address.');
  }
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(accessTeamDomain)) {
    throw new Error('ACCESS_TEAM_DOMAIN must look like your-team.cloudflareaccess.com.');
  }

  return { hostname, allowedEmail, accessTeamDomain };
}
