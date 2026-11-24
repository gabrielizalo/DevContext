import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectJiraIssue } from '../dist/jira.js';

const credentials = { email: 'reader@example.invalid', token: 'synthetic-token' };
const north = { hostname: 'north.atlassian.net', issueKey: 'OPS-7' };
const south = { hostname: 'south.atlassian.net', issueKey: 'DEV-8' };
const northId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const southId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function adf(text) {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

function page(startAt, total, comments) {
  return { startAt, maxResults: 2, total, comments };
}

function jiraStub(responses) {
  const requests = [];
  return {
    requests,
    fetch: async (url, init) => {
      const target = new URL(url);
      requests.push({
        target,
        method: init.method,
        redirect: init.redirect,
        headers: new Headers(init.headers),
      });
      const result = responses[requests.length - 1];
      if (result === undefined) throw new Error('Unexpected Jira request');
      return result instanceof Response ? result : Response.json(result);
    },
  };
}

test('reads two Jira sites with one credential set and preserves every ADF comment', async () => {
  const description = adf('Descripción original');
  const older = { created: '2026-11-01T10:00:00.000+0200', body: adf('Primero') };
  const later = {
    author: { displayName: 'Example Reader' },
    created: '2026-11-01T09:00:00.000Z',
    body: adf('Segundo\nSin truncar'),
  };
  const sameTime = { created: later.created, body: adf('Tercero') };
  const http = jiraStub([
    { cloudId: northId },
    { key: 'OPS-70', fields: { summary: 'Título original', description } },
    page(0, 3, [later, older]),
    page(2, 3, [sameTime]),
    { cloudId: southId },
    { key: 'DEV-8', fields: { summary: '', description: null } },
    page(0, 0, []),
  ]);

  const first = await collectJiraIssue(north, credentials, http.fetch);
  const second = await collectJiraIssue(south, credentials, http.fetch);

  assert.deepEqual(first, {
    id: 'OPS-70',
    title: 'Título original',
    url: 'https://north.atlassian.net/browse/OPS-70',
    description,
    comments: [
      { author: null, createdAt: older.created, body: older.body },
      { author: 'Example Reader', createdAt: later.created, body: later.body },
      { author: null, createdAt: sameTime.created, body: sameTime.body },
    ],
  });
  assert.deepEqual(second, {
    id: 'DEV-8',
    title: '',
    url: 'https://south.atlassian.net/browse/DEV-8',
    description: null,
    comments: [],
  });
  assert.deepEqual(http.requests.map(({ target }) => target.origin + target.pathname), [
    'https://north.atlassian.net/_edge/tenant_info',
    `https://api.atlassian.com/ex/jira/${northId}/rest/api/3/issue/OPS-7`,
    `https://api.atlassian.com/ex/jira/${northId}/rest/api/3/issue/OPS-70/comment`,
    `https://api.atlassian.com/ex/jira/${northId}/rest/api/3/issue/OPS-70/comment`,
    'https://south.atlassian.net/_edge/tenant_info',
    `https://api.atlassian.com/ex/jira/${southId}/rest/api/3/issue/DEV-8`,
    `https://api.atlassian.com/ex/jira/${southId}/rest/api/3/issue/DEV-8/comment`,
  ]);
  const auth = `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString('base64')}`;
  for (const { target, method, redirect, headers } of http.requests) {
    assert.equal(method, 'GET');
    assert.equal(redirect, 'error');
    assert.equal(headers.get('Authorization'), target.hostname === 'api.atlassian.com' ? auth : null);
  }
  assert.equal(http.requests[3].target.searchParams.get('startAt'), '2');
});

test('rejects a lookalike tenant before sending a request', async () => {
  const http = jiraStub([]);
  await assert.rejects(
    collectJiraIssue({ ...north, hostname: 'north.atlassian.net.example.invalid' }, credentials, http.fetch),
    /Jira (site|host|tenant)/i,
  );
  assert.equal(http.requests.length, 0);
});

test('rejects a failed or redirected comment request without fallback or leaking its body', async () => {
  for (const status of [302, 403]) {
    const http = jiraStub([
      { cloudId: northId },
      { key: 'OPS-7', fields: { summary: 'Example', description: null } },
      page(0, 2, [{ created: '2026-11-01T09:00:00.000Z', body: adf('First page') }]),
      new Response('synthetic-token', { status, headers: { Location: 'https://example.invalid/' } }),
    ]);
    await assert.rejects(collectJiraIssue(north, credentials, http.fetch), (error) => {
      assert.match(error.message, /OPS-7.*comments/i);
      assert.doesNotMatch(error.message, /synthetic-token|example\.invalid/);
      return true;
    });
    assert.equal(http.requests.length, 4);
    assert.equal(http.requests[3].target.searchParams.get('startAt'), '1');
  }
});

test('rejects a stalled comment page instead of returning an empty collection', async () => {
  const http = jiraStub([
    { cloudId: northId },
    { key: 'OPS-7', fields: { summary: 'Example', description: null } },
    page(0, 1, []),
  ]);
  await assert.rejects(collectJiraIssue(north, credentials, http.fetch), /comments.*(pagination|page)/i);
  assert.equal(http.requests.length, 3);
});

test('rejects an omitted description instead of treating it as null', async () => {
  const http = jiraStub([{ cloudId: northId }, { key: 'OPS-7', fields: { summary: 'Example' } }]);
  await assert.rejects(collectJiraIssue(north, credentials, http.fetch), /description/i);
  assert.equal(http.requests.length, 2);
});
