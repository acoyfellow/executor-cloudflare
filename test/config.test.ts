import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../src/config.ts';

const valid = {
  EXECUTOR_HOSTNAME: 'executor.example.com',
  EXECUTOR_ALLOWED_EMAIL: 'owner@example.com',
  ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com',
};

describe('loadConfig', () => {
  test('loads a valid configuration', () => {
    expect(loadConfig(valid)).toEqual({
      hostname: 'executor.example.com',
      allowedEmail: 'owner@example.com',
      accessTeamDomain: 'example.cloudflareaccess.com',
    });
  });

  test('reports every missing value', () => {
    expect(() => loadConfig({})).toThrow('EXECUTOR_HOSTNAME, EXECUTOR_ALLOWED_EMAIL, ACCESS_TEAM_DOMAIN');
  });

  test('rejects invalid hostnames and emails', () => {
    expect(() => loadConfig({ ...valid, EXECUTOR_HOSTNAME: 'localhost' })).toThrow('must be a hostname');
    expect(() => loadConfig({ ...valid, EXECUTOR_ALLOWED_EMAIL: 'nope' })).toThrow('one email address');
  });
});
