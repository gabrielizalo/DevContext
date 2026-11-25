import type { Comment, GitHubConversation, GitHubPullRequest, JiraIssue, ReportData } from './report-model.js';

export function descriptionMarkdown(description: string | null): string {
  return description === null || description.trim() === '' ? 'None' : description;
}

function commentMarkdown(comment: Comment, kind: string, heading = '####', nestHeadings = false): string {
  const header = `${heading} ${kind}: ${comment.author ?? 'Unknown author'} — ${comment.createdAt}`;
  const source = comment.url === undefined ? '' : `\n\nSource: ${comment.url}`;
  const body = nestHeadings ? lowerHeadings(comment.body, heading.length) : comment.body;
  return `${header}${source}\n\n${body}`;
}

function* proseLines(lines: readonly string[]): Generator<number> {
  let fence: string | undefined;
  for (let index = 0; index < lines.length; index += 2) {
    const line = lines[index];
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence !== undefined) {
      if (marker !== null && marker[1][0] === fence[0] &&
        marker[1].length >= fence.length && marker[2].trim() === '') fence = undefined;
      continue;
    }
    if (marker !== null && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fence = marker[1];
      continue;
    }
    yield index;
  }
}

function lowerHeadings(body: string, levels: number): string {
  const lines = body.split(/(\r?\n)/);
  let previous = -2;
  const hashes = (level: number) => '#'.repeat(Math.min(6, level + levels));
  for (const index of proseLines(lines)) {
    const line = lines[index];
    const atx = /^( {0,3})(#{1,6})(?=[ \t]|$)(.*)$/.exec(line);
    const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    const title = lines[index - 2]?.trim();
    if (atx !== null) {
      lines[index] = `${atx[1]}${hashes(atx[2].length)}${atx[3]}`;
    } else if (
      underline !== null && previous === index - 2 && title !== undefined && title !== '' &&
      !/^(?: {4}|\t| {0,3}(?:[#><*`~]|\[[^\]]+\]:|(?:[-+]|\d+[.)])(?:\s|$)))/.test(lines[index - 2])
    ) {
      // Setext titles ending in hashes need an escape in ATX form.
      lines[index - 2] = `${hashes(underline[1][0] === '=' ? 1 : 2)} ${title.replace(/#+$/, (run) => `\\${run}`)}`;
      lines[index] = '';
      if (lines[index + 1] !== undefined) lines[index + 1] = '';
    }
    previous = index;
  }
  return lines.join('');
}

function expandDetails(body: string): string {
  // Keep the original line endings and leave literal examples in fenced code intact.
  const lines = body.split(/(\r?\n)/);
  const blocks: { opening: number; summary?: number; label?: string }[] = [];
  for (const index of proseLines(lines)) {
    const line = lines[index];
    if (/^ {0,3}<details(?:\s+open(?:=(?:"open"|'open'|open|""))?)?\s*>\s*$/i.test(line)) {
      blocks.push({ opening: index });
      continue;
    }
    const block = blocks.at(-1);
    if (block === undefined) continue;
    if (/^ {0,3}<\/details>\s*$/i.test(line)) {
      blocks.pop();
      lines[block.opening] = block.summary === undefined ? '**Details**' : '';
      lines[index] = '';
      if (block.summary !== undefined && block.label !== undefined) lines[block.summary] = block.label;
      continue;
    }
    const summary = /^ {0,3}<summary>\s*(.*?)\s*<\/summary>\s*$/i.exec(line);
    if (summary !== null && block.summary === undefined) {
      const label = summary[1].replace(/^<(strong|b)>(.*?)<\/\1>$/i, '$2');
      block.summary = index;
      const newline = lines[index + 1] ?? '\n';
      const needsBlankLine = (lines[index + 2]?.trim() ?? '') !== '';
      block.label = `**${label || 'Details'}**${needsBlankLine ? newline : ''}`;
    }
  }
  return lines.join('');
}

function githubCommentMarkdown(comment: Comment, kind: string, heading?: string, nestHeadings = false): string {
  return commentMarkdown({ ...comment, body: expandDetails(comment.body) }, kind, heading, nestHeadings);
}

export function jiraCommentsMarkdown(issue: JiraIssue, nestHeadings = false): string {
  return issue.comments.length === 0
    ? 'None'
    : issue.comments.map((comment) => commentMarkdown(comment, 'Comment', '####', nestHeadings)).join('\n\n');
}

function conversationMarkdown(conversation: GitHubConversation, nestHeadings: boolean): string {
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
      githubCommentMarkdown(first, 'Inline comment', '#####', nestHeadings),
      ...replies.map((reply) => githubCommentMarkdown(reply, 'Reply', '#####', nestHeadings)),
    ].join('\n\n');
  }
  return githubCommentMarkdown(conversation, 'Comment', '####', nestHeadings);
}

function lineLabel(end: number | undefined, start: number | undefined, prefix: string): string {
  if (end === undefined && start === undefined) return '';
  if (start !== undefined && end !== undefined && start !== end) return `${prefix}lines ${start}–${end}`;
  return `${prefix}line ${end ?? start}`;
}

export function githubCommentsMarkdown(pullRequest: GitHubPullRequest, nestHeadings = false): string {
  return pullRequest.conversations.length === 0
    ? 'None'
    : pullRequest.conversations.map((item) => conversationMarkdown(item, nestHeadings)).join('\n\n');
}

export function renderDefaultReport(data: ReportData): string {
  const jira = data.jira.issues.map((issue) => [
    `# Jira: ${issue.id}`,
    `## ${issue.title}`,
    `Source: ${issue.url}`,
    lowerHeadings(descriptionMarkdown(issue.description), 2),
    '-----',
    '# Jira Comments',
    jiraCommentsMarkdown(issue, true),
  ].join('\n\n'));
  const github = data.github.pullRequests.map((pullRequest) => [
    `# GitHub: ${pullRequest.repository} #${pullRequest.number}`,
    `## ${pullRequest.title}`,
    `Source: ${pullRequest.url}`,
    lowerHeadings(descriptionMarkdown(pullRequest.description), 2),
    '-----',
    '# GitHub Comments',
    githubCommentsMarkdown(pullRequest, true),
  ].join('\n\n'));
  const { date, time } = data.report;
  const resources = [...jira, ...github];
  const sections = ['# Development Context', `Generated: ${date} ${time}`];
  if (resources.length > 0) sections.push(resources.join('\n\n-----\n\n'));
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
