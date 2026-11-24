import type { Comment, GitHubConversation, GitHubPullRequest, JiraIssue, ReportData } from './report-model.js';

export function descriptionMarkdown(description: string | null): string {
  return description === null || description.trim() === '' ? 'None' : description;
}

function commentMarkdown(comment: Comment, kind: string, heading = '####'): string {
  const header = `${heading} ${kind}: ${comment.author ?? 'Unknown author'} — ${comment.createdAt}`;
  const source = comment.url === undefined ? '' : `\n\nSource: ${comment.url}`;
  return `${header}${source}\n\n${comment.body}`;
}

export function jiraCommentsMarkdown(issue: JiraIssue): string {
  return issue.comments.length === 0
    ? 'None'
    : issue.comments.map((comment) => commentMarkdown(comment, 'Comment')).join('\n\n');
}

function conversationMarkdown(conversation: GitHubConversation): string {
  if (conversation.kind === 'thread') {
    const [first, ...replies] = conversation.comments;
    const { path, outdated, line, startLine, originalLine, originalStartLine } = conversation;
    const lines = [
      lineLabel(line, startLine, ''),
      lineLabel(originalLine, originalStartLine, 'original '),
    ].filter((label) => label !== '');
    const location = lines.length === 0 ? path : `${path} (${lines.join('; ')})`;
    return [
      `#### Inline thread${outdated ? ' (outdated)' : ''}: ${location}`,
      commentMarkdown(first, 'Inline comment', '#####'),
      ...replies.map((reply) => commentMarkdown(reply, 'Reply', '#####')),
    ].join('\n\n');
  }
  return commentMarkdown(conversation, conversation.kind === 'review' ? 'Review' : 'Comment');
}

function lineLabel(end: number | undefined, start: number | undefined, prefix: string): string {
  if (end === undefined && start === undefined) return '';
  if (start !== undefined && end !== undefined && start !== end) return `${prefix}lines ${start}–${end}`;
  return `${prefix}line ${end ?? start}`;
}

export function githubCommentsMarkdown(pullRequest: GitHubPullRequest): string {
  return pullRequest.conversations.length === 0
    ? 'None'
    : pullRequest.conversations.map(conversationMarkdown).join('\n\n');
}

export function renderDefaultReport(data: ReportData): string {
  const jira = data.jira.issues.map((issue) => [
    `## Jira: ${issue.id} — ${issue.title}`,
    `Source: ${issue.url}`,
    '### Description',
    descriptionMarkdown(issue.description),
    '### Comments',
    jiraCommentsMarkdown(issue),
  ].join('\n\n'));
  const github = data.github.pullRequests.map((pullRequest) => [
    `## GitHub: ${pullRequest.repository} #${pullRequest.number} — ${pullRequest.title}`,
    `Source: ${pullRequest.url}`,
    '### Description',
    descriptionMarkdown(pullRequest.description),
    '### Conversations',
    githubCommentsMarkdown(pullRequest),
  ].join('\n\n'));
  const { date, time } = data.report;
  const sections = ['# Development Context', `Generated: ${date} ${time}`, ...jira, ...github];
  return `${sections.join('\n\n')}\n`;
}

type Collection = 'jira.issues' | 'github.pullRequests';
type Values = {
  readonly [field: string]: () => string;
};
type Part =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'field'; readonly name: string }
  | { readonly kind: 'loop'; readonly collection: Collection; readonly body: Part[] };

const fields: Record<Collection, readonly string[]> = {
  'jira.issues': ['id', 'title', 'description', 'comments', 'url'],
  'github.pullRequests': ['repository', 'number', 'title', 'description', 'comments', 'url'],
};
const metadataFields = ['report.date', 'report.time'];

function jiraValues(issue: JiraIssue): Values {
  return {
    id: () => issue.id, title: () => issue.title, url: () => issue.url,
    description: () => descriptionMarkdown(issue.description),
    comments: () => jiraCommentsMarkdown(issue),
  };
}

function githubValues(pr: GitHubPullRequest): Values {
  return {
    repository: () => pr.repository, number: () => String(pr.number), title: () => pr.title, url: () => pr.url,
    description: () => descriptionMarkdown(pr.description),
    comments: () => githubCommentsMarkdown(pr),
  };
}

export function compileTemplate(source: string, path: string): (data: ReportData) => string {
  const parts: Part[] = [];
  let loop: Extract<Part, { kind: 'loop' }> | undefined;
  let offset = 0;
  let loopStart = 0;
  const fail = (message: string, at: number): never => {
    const preceding = source.slice(0, at).split('\n');
    throw new Error(`${path}:${preceding.length}:${preceding[preceding.length - 1].length + 1}: ${message}`);
  };
  for (;;) {
    const start = source.indexOf('{{', offset);
    const target = loop?.body ?? parts;
    if (start === -1) {
      target.push({ kind: 'text', value: source.slice(offset) });
      break;
    }
    target.push({ kind: 'text', value: source.slice(offset, start) });
    const end = source.indexOf('}}', start + 2);
    if (end === -1) fail('Unclosed template tag.', start);
    const tag = source.slice(start + 2, end).trim();
    if (tag === '/each') {
      if (loop === undefined) fail('Unexpected {{/each}}.', start);
      loop = undefined;
    } else if (tag.startsWith('#')) {
      if (loop !== undefined) fail('Nested loops are not supported.', start);
      const collection = /^#each\s+(\S+)$/.exec(tag)?.[1];
      if (collection === 'jira.issues' || collection === 'github.pullRequests') {
        loop = { kind: 'loop', collection, body: [] };
        parts.push(loop);
        loopStart = start;
      } else {
        fail('Invalid loop; use {{#each jira.issues}} or {{#each github.pullRequests}}.', start);
      }
    } else {
      if (!/^[a-zA-Z.]+$/.test(tag)) fail('Malformed template tag.', start);
      if (!metadataFields.includes(tag) && (loop === undefined || !fields[loop.collection].includes(tag))) {
        fail(`Unknown template field "${tag}".`, start);
      }
      target.push({ kind: 'field', name: tag });
    }
    offset = end + 2;
  }
  if (loop !== undefined) fail('Unclosed loop; add {{/each}}.', loopStart);

  return (data) => {
    const metadata: Values = { 'report.date': () => data.report.date, 'report.time': () => data.report.time };
    function render(body: readonly Part[], values: Values): string {
      return body.map((part) => {
        if (part.kind === 'text') return part.value;
        if (part.kind === 'field') return values[part.name]();
        if (part.collection === 'jira.issues') {
          return data.jira.issues.map((issue) => render(part.body, { ...metadata, ...jiraValues(issue) })).join('');
        }
        return data.github.pullRequests.map((pr) => render(part.body, { ...metadata, ...githubValues(pr) })).join('');
      }).join('');
    }
    return render(parts, metadata);
  };
}
