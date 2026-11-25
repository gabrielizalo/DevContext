export interface Comment {
  readonly author: string | null;
  readonly createdAt: string;
  readonly body: string;
  readonly url?: string;
}

export interface JiraIssue {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly description: string | null;
  readonly comments: readonly Comment[];
}

export type GitHubConversation =
  | (Comment & { readonly kind: 'comment' })
  | {
      readonly kind: 'thread';
      readonly path: string;
      readonly outdated: boolean;
      readonly startLine?: number;
      readonly line?: number;
      readonly originalStartLine?: number;
      readonly originalLine?: number;
      readonly comments: readonly [Comment, ...Comment[]];
    };

export interface GitHubPullRequest {
  readonly repository: string;
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly description: string | null;
  readonly conversations: readonly GitHubConversation[];
}

export interface ReportData {
  readonly report: { readonly date: string; readonly time: string };
  readonly jira: { readonly issues: readonly JiraIssue[] };
  readonly github: { readonly pullRequests: readonly GitHubPullRequest[] };
}
