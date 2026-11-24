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
