import type { Comment, GitHubConversation, GitHubPullRequest, JiraIssue, ReportData } from './report-model.js';

export function descriptionMarkdown(description: string | null): string {
  return description === null || description.trim() === '' ? 'None' : description;
}

function commentMarkdown(comment: Comment, kind: string): string {
  const header = `#### ${kind}: ${comment.author ?? 'Unknown author'} — ${comment.createdAt}`;
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
    return [
      commentMarkdown(first, 'Inline comment'),
      ...replies.map((reply) => commentMarkdown(reply, 'Reply')),
    ].join('\n\n');
  }
  return commentMarkdown(conversation, conversation.kind === 'review' ? 'Review' : 'Comment');
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
