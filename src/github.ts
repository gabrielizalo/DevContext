import type { Comment, GitHubConversation, GitHubPullRequest } from './report-model.js';

interface GitHubReference {
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}

type Query = (document: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>>;
const prVariables = '$owner: String!, $repository: String!, $number: Int!';
const prField = 'repository(owner: $owner, name: $repository) { pullRequest(number: $number)';
const commentFields = 'author { login } createdAt body url';
const pageFields = 'pageInfo { hasNextPage endCursor }';
const details = `query PullRequestDetails(${prVariables}) {
  ${prField} { title body url number repository { nameWithOwner } } }
}`;
const commentsQuery = `query PullRequestComments(${prVariables}, $after: String) {
  ${prField} { items: comments(first: 50, after: $after) { nodes { ${commentFields} } ${pageFields} } } }
}`;
const reviewsQuery = `query PullRequestReviews(${prVariables}, $after: String) {
  ${prField} { items: reviews(first: 50, after: $after) { nodes { ${commentFields} state } ${pageFields} } } }
}`;
const threadsQuery = `query PullRequestThreads(${prVariables}, $after: String) {
  ${prField} { items: reviewThreads(first: 50, after: $after) {
    nodes { id isResolved isOutdated path line startLine originalLine originalStartLine } ${pageFields}
  } } }
}`;
const repliesQuery = `query ThreadComments($id: ID!, $after: String) {
  node(id: $id) { ... on PullRequestReviewThread {
    items: comments(first: 50, after: $after) { nodes { ${commentFields} } ${pageFields} }
  } }
}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pullRequest(data: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(data.repository) || !isRecord(data.repository.pullRequest)) {
    throw new Error('Pull request unavailable. Check the URL and GitHub read permissions.');
  }
  return data.repository.pullRequest;
}

function sourceLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!/^https:\/\/github\.com\/[^\s]+$/i.test(value)) return undefined;
  return value;
}

function parseComment(value: Record<string, unknown>): Comment {
  if (
    typeof value.body !== 'string' ||
    typeof value.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.createdAt) ||
    !Number.isFinite(Date.parse(value.createdAt))
  ) throw new Error('Invalid GitHub conversation body or creation timestamp.');
  const login = isRecord(value.author) ? value.author.login : undefined;
  return {
    author: typeof login === 'string' && login !== '' ? login : null,
    createdAt: value.createdAt,
    body: value.body,
    url: sourceLink(value.url),
  };
}

async function connection(
  getPage: (after: string | null) => Promise<unknown>,
): Promise<Record<string, unknown>[]> {
  const nodes: Record<string, unknown>[] = [];
  const cursors = new Set<string>();
  let after: string | null = null;
  for (;;) {
    const page = await getPage(after);
    if (!isRecord(page) || !Array.isArray(page.nodes) || !isRecord(page.pageInfo)) {
      throw new Error('Invalid GitHub pagination response.');
    }
    for (const node of page.nodes) {
      if (!isRecord(node)) throw new Error('Invalid GitHub pagination item.');
      nodes.push(node);
    }
    const { endCursor, hasNextPage } = page.pageInfo;
    if (hasNextPage === false) return nodes;
    if (hasNextPage !== true || typeof endCursor !== 'string' || endCursor === '' || cursors.has(endCursor) || page.nodes.length === 0) {
      throw new Error('Invalid or stalled GitHub pagination.');
    }
    cursors.add(endCursor);
    after = endCursor;
  }
}

function githubQuery(fetcher: typeof fetch, token: string): Query {
  return async (query, variables) => {
    let response: Response;
    try {
      response = await fetcher(new URL('https://api.github.com/graphql'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error('GitHub request failed. Check network connectivity; redirects are not followed.');
    }
    if (!response.ok) {
      const seconds = response.headers.get('Retry-After');
      const retry = seconds !== null && /^\d{1,10}$/.test(seconds) ? ` Retry in ${seconds} seconds.` : '';
      const isLimited = response.status === 429 || (response.status === 403 &&
        (seconds !== null || response.headers.get('X-RateLimit-Remaining') === '0'));
      const action = isLimited ? `Rate limited. Retry later.${retry}`
        : response.status === 401 || response.status === 403 ? 'Check GITHUB_TOKEN and repository read permissions.'
          : 'Check GitHub availability and the PR URL.';
      throw new Error(`GitHub HTTP ${response.status}. ${action}`);
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error('GitHub GraphQL response could not be read as JSON.');
    }
    if (
      !isRecord(result) ||
      (result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length !== 0)) ||
      !isRecord(result.data)
    ) throw new Error('GitHub GraphQL query failed. Check repository read access or try again later.');
    return result.data;
  };
}

function lineNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function byCreation(a: Comment, b: Comment): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

async function collectThreads(query: Query, variables: Record<string, unknown>): Promise<GitHubConversation[]> {
  const threads = await connection(async (after) =>
    pullRequest(await query(threadsQuery, { ...variables, after })).items);
  const included: GitHubConversation[] = [];
  for (const thread of threads) {
    if (thread.isResolved === true) continue;
    if (
      thread.isResolved !== false || typeof thread.isOutdated !== 'boolean' ||
      typeof thread.id !== 'string' || thread.id === '' || typeof thread.path !== 'string' || thread.path === ''
    ) throw new Error('Invalid GitHub review thread metadata.');
    const id = thread.id;
    const rawComments = await connection(async (after) => {
      const { node } = await query(repliesQuery, { id, after });
      return isRecord(node) ? node.items : undefined;
    });
    const [first, ...replies] = rawComments.map(parseComment).sort(byCreation);
    if (first === undefined) throw new Error('An unresolved GitHub thread returned no comments.');
    included.push({
      kind: 'thread', path: thread.path, outdated: thread.isOutdated,
      line: lineNumber(thread.line), startLine: lineNumber(thread.startLine),
      originalLine: lineNumber(thread.originalLine), originalStartLine: lineNumber(thread.originalStartLine),
      comments: [first, ...replies],
    });
  }
  return included;
}

export async function collectGitHubPullRequest(
  reference: GitHubReference,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<GitHubPullRequest> {
  const { owner, repository, number } = reference;
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(owner) || !/^[a-z\d_.-]+$/i.test(repository) ||
    !Number.isInteger(number) || number < 1 || number > 2_147_483_647) {
    throw new Error('Invalid GitHub pull request reference.');
  }
  const variables = { owner, repository, number };
  const query = githubQuery(fetcher, token);
  try {
    const raw = pullRequest(await query(details, variables));
    const url = sourceLink(raw.url);
    if (url === undefined || raw.number !== number || typeof raw.title !== 'string' ||
      typeof raw.body !== 'string' || !isRecord(raw.repository) ||
      typeof raw.repository.nameWithOwner !== 'string') {
      throw new Error('Invalid GitHub pull request details.');
    }
    const commentNodes = await connection(async (after) =>
      pullRequest(await query(commentsQuery, { ...variables, after })).items);
    const reviewNodes = await connection(async (after) =>
      pullRequest(await query(reviewsQuery, { ...variables, after })).items);
    const conversations: GitHubConversation[] = commentNodes.map((node) => ({ ...parseComment(node), kind: 'comment' }));
    for (const review of reviewNodes) {
      if (typeof review.state !== 'string' || typeof review.body !== 'string') {
        throw new Error('Invalid GitHub review state or body.');
      }
      if (review.state !== 'PENDING' && review.body.trim() !== '') {
        conversations.push({ ...parseComment(review), kind: 'review' });
      }
    }
    for (const thread of await collectThreads(query, variables)) conversations.push(thread);
    conversations.sort((a, b) => byCreation(
      a.kind === 'thread' ? a.comments[0] : a,
      b.kind === 'thread' ? b.comments[0] : b,
    ));
    return { repository: raw.repository.nameWithOwner, number, title: raw.title, description: raw.body, url, conversations };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Collection failed.';
    throw new Error(`GitHub ${owner}/${repository} #${number}: ${message}`);
  }
}
