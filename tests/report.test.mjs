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
const jiraSection = '# Jira: OPS-7\n\n## Título original\n\nSource: https://north.atlassian.net/browse/OPS-7\n\n**Texto**\n\n-----\n\n# Jira Comments\n\nNone';
const githubSection = '# GitHub: example/widget #2\n\n## Original PR\n\nSource: https://github.com/example/widget/pull/2\n\nNone\n\n-----\n\n# GitHub Comments\n\nNone';

test('renders Jira-only and GitHub-only reports without absent platform sections', () => {
  assert.equal(renderDefaultReport(report([issue])), `${header}\n\n${jiraSection}\n`);
  assert.equal(renderDefaultReport(report([], [pullRequest])), `${header}\n\n${githubSection}\n`);
});

test('renders Jira before GitHub while preserving each collection order', () => {
  const output = renderDefaultReport(report(
    [issue, { ...issue, id: 'OPS-1' }],
    [pullRequest, { ...pullRequest, number: 1 }],
  ));
  assert.deepEqual(output.match(/^# .+$/gm), [
    '# Development Context',
    '# Jira: OPS-7', '# Jira Comments',
    '# Jira: OPS-1', '# Jira Comments',
    '# GitHub: example/widget #2', '# GitHub Comments',
    '# GitHub: example/widget #1', '# GitHub Comments',
  ]);
  assert.ok(output.includes('\n\nNone\n\n-----\n\n# GitHub:'));
});

test('nests source headings in the default outline without changing custom output or fenced examples', () => {
  const description = '# Overview\n\n## Scope\n\nExample\n=======\n\n```md\n# Literal\n```\n';
  const data = report([], [{ ...pullRequest, description, conversations: [
    { kind: 'comment', author: 'reader', createdAt: '2026-11-24T09:03:00Z', body: '# Comment heading' },
  ] }]);
  const output = renderDefaultReport(data);
  assert.ok(output.includes('### Overview\n\n#### Scope\n\n### Example'));
  assert.ok(output.includes('```md\n# Literal\n```'));
  assert.match(output, /^##### Comment heading$/m);
  const custom = compileTemplate('{{#each github.pullRequests}}{{description}}{{/each}}', 'example.md');
  assert.equal(custom(data), description);
});

test('nests opted-in template descriptions and conversations under their parent headings', () => {
  const description = '# Overview\n\n## Scope\n\n```md\n# Literal\n```';
  const review = {
    kind: 'review', author: 'reviewer', createdAt: '2026-11-24T09:03:00Z',
    body: '# Review scope', url: `${pullRequest.url}#pullrequestreview-123`,
  };
  const data = report([{ ...issue, description }], [{ ...pullRequest, description, conversations: [review] }]);
  const custom = compileTemplate([
    '{{#each jira.issues}}### {{id}}\n\n{{description | nest 3}}\n{{/each}}',
    '{{#each github.pullRequests}}### {{title}}\n\n{{description | nest 3}}\n\n',
    '#### Reviews\n\n{{comments | nest 4}}{{/each}}',
  ].join(''), 'example.md');
  const output = custom(data);
  assert.equal(output.match(/^#### Overview\n\n##### Scope\n\n```md\n# Literal\n```$/gm)?.length, 2);
  assert.match(output, /^##### Review summary: reviewer/m);
  assert.match(output, /^###### Review scope$/m);
  assert.ok(output.includes(`Source: ${review.url}`));
  assert.match(renderDefaultReport(data), /^#### Review summary: reviewer/m);
  assert.throws(() => compileTemplate('{{#each jira.issues}}{{title | nest 3}}{{/each}}', 'example.md'),
    /example\.md:1:\d+/);
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

test('makes retained GitHub details readable in either template without changing fenced examples', () => {
  const body = '<details open>\r\n<summary><strong>Context</strong></summary>\r\n\r\nKeep **this**.\r\n</details>\r\n\r\n```html\r\n<details open>\r\n<summary>Literal</summary>\r\n</details>\r\n```';
  const data = report([], [{ ...pullRequest, conversations: [
    { kind: 'comment', author: 'reader', createdAt: '2026-11-24T09:03:00Z', body },
  ] }]);
  const custom = compileTemplate('{{#each github.pullRequests}}{{comments}}{{/each}}', 'example.md');
  for (const output of [renderDefaultReport(data), custom(data)]) {
    assert.ok(output.includes('**Context**\r\n\r\nKeep **this**.'));
    assert.ok(output.includes('```html\r\n<details open>\r\n<summary>Literal</summary>\r\n</details>\r\n```'));
    assert.equal(output.match(/<details open>/g)?.length, 1);
  }
  assert.doesNotMatch(custom(data), /-----/);
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
