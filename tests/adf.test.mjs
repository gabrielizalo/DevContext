import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adfToMarkdown } from '../dist/adf.js';
import { jiraIssueToMarkdown } from '../dist/jira.js';

const text = (value, marks) => ({ type: 'text', text: value, marks });
const node = (type, ...content) => ({ type, content });
const paragraph = (...content) => node('paragraph', ...content);
const document = (...content) => ({ ...node('doc', ...content), version: 1 });

test('converts headings, marks, nested lists, tables and code without changing the words', () => {
  const body = document(
    { ...node('heading', text('Contexto')), attrs: { level: 2 } },
    paragraph(
      text('Importante', [{ type: 'strong' }]),
      text(' y '),
      text('docs', [{ type: 'link', attrs: { href: 'https://example.invalid/docs' } }]),
    ),
    node('bulletList', node('listItem', paragraph(text('Primero')),
      node('bulletList', node('listItem', paragraph(text('Anidado')))))),
    node('table',
      node('tableRow', node('tableHeader', paragraph(text('Estado')))),
      node('tableRow', node('tableCell', paragraph(text('A | B')))),
    ),
    { ...node('codeBlock', text('line\n```')), attrs: { language: 'text' } },
  );
  assert.equal(adfToMarkdown(body), [
    '## Contexto',
    '**Importante** y [docs](<https://example.invalid/docs>)',
    '- Primero\n  - Anidado',
    '| Estado |\n| --- |\n| A \\| B |',
    '````text\nline\n```\n````',
  ].join('\n\n'));
});

test('keeps mention text, media labels and text from unsupported nodes', () => {
  const body = document(
    paragraph({ type: 'mention', attrs: { text: '@Example' } }),
    node('mediaSingle', { type: 'media', attrs: { alt: 'Diagram' } }),
    node('futureNode', paragraph(text('Preserve this'))),
  );
  assert.equal(adfToMarkdown(body), '@Example\n\n[Media: Diagram]\n\n[Unsupported ADF: futureNode]\n\nPreserve this');
});

test('omits unsupported inline marks without losing text or supported marks', () => {
  const body = document(paragraph(
    text('Pink', [{ type: 'textColor', attrs: { color: '#ff00ff' } }, { type: 'strong' }]),
    text(' and '),
    text('readable', [{ type: 'futureMark' }]),
  ));
  assert.equal(adfToMarkdown(body), '**Pink** and readable');
});

test('rejects malformed nested nodes rather than discarding them', () => {
  assert.throws(() => adfToMarkdown(document(paragraph({ type: 'text' }))), /ADF.*text/i);
  assert.throws(() => adfToMarkdown({ type: 'doc', content: [] }), /ADF.*document/i);
});

test('normalizes issue and comment bodies without rewriting metadata', () => {
  const issue = {
    id: 'OPS-7',
    title: 'Original',
    url: 'https://north.atlassian.net/browse/OPS-7',
    description: document(paragraph()),
    comments: [{ author: null, createdAt: '2026-11-01T09:00:00Z', body: document(paragraph(text('Reply'))) }],
  };
  assert.deepEqual(jiraIssueToMarkdown(issue), {
    ...issue,
    description: null,
    comments: [{ author: null, createdAt: '2026-11-01T09:00:00Z', body: 'Reply' }],
  });
});
