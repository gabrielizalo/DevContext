import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGitHubPullRequest } from '../dist/github.js';

const reference = { owner: 'example', repository: 'widget', number: 2 };
const token = 'synthetic-github-token';
const url = 'https://github.com/example/widget/pull/2';
const createdAt = '2026-11-24T09:00:00Z';
const comment = (body, extra = {}) => ({ body, createdAt, author: { login: 'reader' }, url: `${url}#example`, ...extra });
const pr = (pullRequest) => ({ data: { repository: { pullRequest } } });
const page = (nodes, next = null) => pr({ items: { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } } });
const details = pr({ title: 'Original PR', body: '**Markdown**', url, number: 2, repository: { nameWithOwner: 'example/widget' } });

test('collects every general comment and written submitted review across pages', async () => {
  const requests = [];
  const fetch = async (target, init) => {
    const { query, variables } = JSON.parse(init.body);
    requests.push(variables.after ?? null);
    assert.equal(new URL(target).href, 'https://api.github.com/graphql');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${token}`);
    assert.match(query, /^query /);
    if (query.includes('query PullRequestDetails')) return Response.json(details);
    if (query.includes('query PullRequestComments')) return Response.json(variables.after === null
      ? page([comment('first')], 'comments-2')
      : page([comment('last', { createdAt: '2026-11-25T09:00:00Z', author: null })]));
    return Response.json(variables.after === null
      ? page([
        comment('   ', { state: 'APPROVED' }),
        comment('draft', { state: 'PENDING' }),
      ], 'reviews-2')
      : page([comment(' **Review** ', { state: 'DISMISSED' })]));
  };
  const result = await collectGitHubPullRequest(reference, token, fetch);
  assert.equal(result.description, '**Markdown**');
  assert.equal(result.url, url);
  assert.deepEqual(result.conversations.map(({ kind, author, body }) => ({ kind, author, body })), [
    { kind: 'comment', author: 'reader', body: 'first' },
    { kind: 'review', author: 'reader', body: ' **Review** ' },
    { kind: 'comment', author: null, body: 'last' },
  ]);
  assert.deepEqual(requests, [null, null, 'comments-2', null, 'reviews-2']);
});

test('fails on GraphQL errors even when response status and some data look successful', async () => {
  await assert.rejects(collectGitHubPullRequest(reference, token, async () => Response.json({
    ...details, errors: [{ message: token }],
  })), (error) => {
    assert.match(error.message, /example\/widget #2.*GraphQL/i);
    assert.doesNotMatch(error.message, new RegExp(token));
    return true;
  });
});

test('rejects a pagination cursor that cycles instead of returning partial data', async () => {
  let count = 0;
  const fetch = async () => {
    count += 1;
    assert.ok(count <= 3);
    return Response.json(count === 1 ? details : page([comment('repeat')], 'same-cursor'));
  };
  await assert.rejects(collectGitHubPullRequest(reference, token, fetch), /pagination/i);
});
