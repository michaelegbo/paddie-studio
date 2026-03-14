#!/usr/bin/env node

const studioBase = (process.env.STUDIO_BASE_URL || 'https://studio.paddie.io').replace(/\/$/, '');
const paddieIssuer = (process.env.PADDIE_OIDC_ISSUER || 'https://api.paddie.io').replace(/\/$/, '');
const timeoutMs = Number(process.env.STUDIO_SMOKE_TIMEOUT_MS || 15000);

const checks = [
  {
    name: 'Studio site root',
    url: `${studioBase}/`,
    ok: (status) => status >= 200 && status < 400,
  },
  {
    name: 'Studio web app route',
    url: `${studioBase}/app`,
    ok: (status) => status >= 200 && status < 400,
  },
  {
    name: 'Studio API health',
    url: `${studioBase}/api/health`,
    ok: (status) => status === 200,
  },
  {
    name: 'Studio API me (unauth allowed)',
    url: `${studioBase}/api/me`,
    ok: (status) => status === 200 || status === 401,
  },
  {
    name: 'Studio webhook route reachability',
    url: `${studioBase}/api/webhooks/smoke-check-flow/smoke-check-token`,
    method: 'POST',
    body: JSON.stringify({ ping: 'smoke' }),
    headers: { 'content-type': 'application/json' },
    ok: (status) => [200, 400, 401, 403, 404, 405].includes(status),
  },
  {
    name: 'Paddie OIDC discovery',
    url: `${paddieIssuer}/.well-known/openid-configuration`,
    ok: (status) => status === 200,
  },
  {
    name: 'Paddie OIDC JWKS',
    url: `${paddieIssuer}/.well-known/jwks.json`,
    ok: (status) => status === 200,
  },
];

async function runCheck(check) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(check.url, {
      method: check.method || 'GET',
      body: check.body,
      headers: check.headers,
      redirect: 'follow',
      signal: controller.signal,
    });

    const pass = check.ok(response.status);
    return {
      ...check,
      status: response.status,
      pass,
      error: pass ? null : `Unexpected status ${response.status}`,
    };
  } catch (error) {
    return {
      ...check,
      status: null,
      pass: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`Running Studio deployment smoke checks against ${studioBase}`);
  const results = [];

  for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);

    const label = result.pass ? 'PASS' : 'FAIL';
    const statusPart = result.status !== null ? `status=${result.status}` : 'status=n/a';
    console.log(`[${label}] ${check.name} (${statusPart})`);
    if (result.error && !result.pass) {
      console.log(`       ${result.error}`);
    }
  }

  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    console.error(`\n${failed.length} smoke check(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log('\nAll smoke checks passed.');
}

main();
