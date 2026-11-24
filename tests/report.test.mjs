import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileTemplate, renderDefaultReport } from '../dist/report.js';

const issue = {
  id: 'OPS-7', title: 'Título original', url: 'https://north.atlassian.net/browse/OPS-7',
  description: '**Texto**', comments: [],
};
const pullRequest = {
  repository: 'example/widget', number: 2, title: 'Original PR', url: 'https://github.com/example/widget/pull/2',
  description: null, conversations: [],
};
const report = (issues = [], pullRequests = []) => ({
  report: { date: '2026-11-24', time: '06:42:15' },
  jira: { issues },
  github: { pullRequests },
});
const header = '# Development Context\n\nGenerated: 2026-11-24 06:42:15';
const jiraSection = '## Jira: OPS-7 — Título original\n\nSource: https://north.atlassian.net/browse/OPS-7\n\n### Description\n\n**Texto**\n\n### Comments\n\nNone';
const githubSection = '## GitHub: example/widget #2 — Original PR\n\nSource: https://github.com/example/widget/pull/2\n\n### Description\n\nNone\n\n### Conversations\n\nNone';

test('renders Jira-only and GitHub-only reports without absent platform sections', () => {
  assert.equal(renderDefaultReport(report([issue])), `${header}\n\n${jiraSection}\n`);
  assert.equal(renderDefaultReport(report([], [pullRequest])), `${header}\n\n${githubSection}\n`);
});

test('renders Jira before GitHub while preserving each collection order', () => {
  const output = renderDefaultReport(report(
    [issue, { ...issue, id: 'OPS-1' }],
    [pullRequest, { ...pullRequest, number: 1 }],
  ));
  assert.deepEqual(output.match(/^## (Jira|GitHub): .+$/gm), [
    '## Jira: OPS-7 — Título original',
    '## Jira: OPS-1 — Título original',
    '## GitHub: example/widget #2 — Original PR',
    '## GitHub: example/widget #1 — Original PR',
  ]);
});

test('preserves raw Markdown bodies and shows available author, time and source', () => {
  const body = '```text\n{{title}} <raw>\n```';
  const output = renderDefaultReport(report([{ ...issue, comments: [
    { author: null, createdAt: '2026-11-24T09:03:00Z', body, url: 'https://example.invalid/comment' },
  ] }]));
  assert.ok(output.includes('Unknown author — 2026-11-24T09:03:00Z'));
  assert.ok(output.includes('https://example.invalid/comment'));
  assert.ok(output.includes(body));
});

test('labels outdated threads and identifies historical ranges without inventing current lines', () => {
  const comment = { author: 'reviewer', createdAt: '2026-11-24T09:03:00Z', body: '**Check**' };
  const output = renderDefaultReport(report([], [{
    ...pullRequest,
    conversations: [{
      kind: 'thread', path: 'src/example.ts', outdated: true, originalStartLine: 17, originalLine: 19,
      comments: [comment, { ...comment, author: 'pr-author', body: 'Reply' }],
    }],
  }]));
  assert.match(output, /Inline thread \(outdated\): src\/example\.ts \(original lines 17–19\)/);
  assert.match(output, /^##### Reply: pr-author/m);
  assert.match(output, /\*\*Check\*\*/);
});

test('renders repeated loops and empty collections without changing static or inserted text', () => {
  const render = compileTemplate([
    '## PRs\n{{#each github.pullRequests}}{{number}}{{/each}}\n',
    '{{#each jira.issues}}{{ id }}: {{title}}\n{{/each}}',
    '{{#each jira.issues}}{{report.date}}: {{description}}{{/each}}',
  ].join(''), 'example.md');
  const data = report([{ ...issue, description: '{{id}} <raw>' }]);
  assert.equal(render(data), '## PRs\n\nOPS-7: Título original\n2026-11-24: {{id}} <raw>');
});

test('validates unknown fields in unused loops and rejects malformed or nested tags', () => {
  assert.throws(() => compileTemplate('Heading\n{{#each jira.issues}}{{titlePrefix}}{{/each}}', 'example.md'),
    /example\.md:2:\d+.*unknown.*titlePrefix/i);
  for (const source of ['{{bad', '{{/each}}', '{{#each jira.issues}}', '{{#each jira.issues}}{{#each github.pullRequests}}{{/each}}{{/each}}']) {
    assert.throws(() => compileTemplate(source, 'example.md'), /example\.md:1:\d+/);
  }
});
