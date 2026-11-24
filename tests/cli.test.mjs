import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCli } from '../dist/cli.js';

const instant = new Date(2026, 10, 24, 6, 42, 15);
const issueUrl = 'https://north.atlassian.net/browse/OPS-7';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env = 'JIRA_EMAIL=reader@example.invalid\nJIRA_API_TOKEN=synthetic-token\n';

async function setup(t, options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'devcontext-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const stdout = [];
  const stderr = [];
  if (options.env !== undefined) await writeFile(join(cwd, '.env'), options.env);
  return {
    cwd, stdout, stderr,
    run: (args) => runCli(args, {
      cwd,
      now: () => instant,
      fetch: options.fetch,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    }),
  };
}

function jiraResponse(path) {
  if (path === '/_edge/tenant_info') return Response.json({ cloudId: tenantId });
  if (path.endsWith('/comment')) return Response.json({ startAt: 0, maxResults: 50, total: 0, comments: [] });
  return Response.json({ key: 'OPS-7', fields: { summary: 'Example issue', description: null } });
}

test('writes one Jira report with repeat inputs and no GitHub credentials', async (t) => {
  const requests = [];
  const cli = await setup(t, { env, fetch: async (url) => {
    requests.push(url);
    return jiraResponse(url.pathname);
  } });
  assert.equal(await cli.run([issueUrl, `${issueUrl}/?src=example#section`]), 0);
  const name = 'DevContext-report-20261124-064215.md';
  assert.deepEqual(await readdir(join(cli.cwd, 'reports')), [name]);
  const content = await readFile(join(cli.cwd, 'reports', name), 'utf8');
  assert.match(content, /Generated: 2026-11-24 06:42:15/);
  assert.equal(content.match(/## Jira: OPS-7 — Example issue/g)?.length, 2);
  assert.doesNotMatch(content, /synthetic-token|## GitHub/);
  assert.equal(requests.length, 6);
  assert.equal(cli.stdout.length, 1);
  assert.match(cli.stdout[0], /reports\/DevContext-report-/);
});

test('shows help without credentials and validates every URL before requesting', async (t) => {
  const cli = await setup(t, { fetch: async () => assert.fail('No request expected') });
  assert.equal(await cli.run(['--help']), 0);
  assert.match(cli.stdout[0], /Usage:/);
  assert.equal(await cli.run([issueUrl, 'https://north.atlassian.net.example.invalid/browse/OPS-7?private=value']), 1);
  assert.match(cli.stderr[0], /URL 2/);
  assert.doesNotMatch(cli.stderr[0], /private=value/);
  assert.equal(await cli.run([issueUrl]), 1);
  assert.match(cli.stderr[1], /\.env/);
});

test('leaves no completed report after retrieval or conversion fails', async (t) => {
  for (const issueResponse of [
    () => new Response('synthetic-token', { status: 403 }),
    () => Response.json({
      key: 'OPS-7',
      fields: { summary: 'Example', description: { type: 'doc', version: 1, content: [{ type: 'text' }] } },
    }),
  ]) {
    const cli = await setup(t, { env, fetch: async (url) => url.pathname.endsWith('/issue/OPS-7')
      ? issueResponse() : jiraResponse(url.pathname) });
    assert.equal(await cli.run([issueUrl]), 1);
    assert.match(cli.stderr[0], /OPS-7/);
    assert.doesNotMatch(cli.stderr[0], /synthetic-token/);
    assert.deepEqual(await readdir(cli.cwd), ['.env']);
  }
});

test('writes GitHub-only and mixed reports, using credentials only for requested services', async (t) => {
  const githubUrl = 'https://github.com/example/widget/pull/2';
  for (const mixed of [false, true]) {
    const cli = await setup(t, {
      env: `${mixed ? env : ''}GITHUB_TOKEN=synthetic-github-token\n`,
      fetch: async (url, init) => {
        if (new URL(url).hostname !== 'api.github.com') {
          assert.equal(mixed, true);
          return jiraResponse(url.pathname);
        }
        const { query } = JSON.parse(init.body);
        const pullRequest = query.includes('query PullRequestDetails')
          ? { title: 'Example PR', body: '', url: githubUrl, number: 2, repository: { nameWithOwner: 'example/widget' } }
          : { items: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
        return Response.json({ data: { repository: { pullRequest } } });
      },
    });
    assert.equal(await cli.run(mixed ? [githubUrl, issueUrl, githubUrl] : [githubUrl]), 0);
    const output = await readFile(join(cli.cwd, 'reports', 'DevContext-report-20261124-064215.md'), 'utf8');
    assert.equal(output.match(/^## GitHub: example\/widget #2 — Example PR$/gm)?.length, mixed ? 2 : 1);
    assert.equal(output.includes('## Jira:'), mixed);
    if (mixed) assert.ok(output.indexOf('## Jira:') < output.indexOf('## GitHub:'));
  }
});
