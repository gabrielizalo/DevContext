import { Buffer } from 'node:buffer';
import { adfToMarkdown } from './adf.js';
import type { Comment, JiraIssue } from './report-model.js';

interface JiraReference {
  readonly hostname: string;
  readonly issueKey: string;
}

interface JiraCredentials {
  readonly email: string;
  readonly token: string;
}

interface AdfDocument {
  readonly type: 'doc';
  readonly version: 1;
  readonly content: readonly unknown[];
}

type JiraAdfComment = Omit<Comment, 'body'> & { readonly body: AdfDocument };
type JiraAdfIssue = Omit<JiraIssue, 'description' | 'comments'> & {
  readonly description: AdfDocument | null;
  readonly comments: readonly JiraAdfComment[];
};

const tenantHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/i;
const issueKey = /^[a-z][a-z0-9_]*-[0-9]+$/i;
const cloudId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAdfDocument(value: unknown): value is AdfDocument {
  return isRecord(value) && value.type === 'doc' && value.version === 1 && Array.isArray(value.content);
}

function isOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function httpError(response: Response): string {
  switch (response.status) {
    case 401:
      return 'HTTP 401; check JIRA_EMAIL and JIRA_API_TOKEN.';
    case 403:
    case 404:
      return `HTTP ${response.status}; check the issue key and your Jira read access.`;
    case 429: {
      const retry = response.headers.get('Retry-After');
      if (retry !== null && /^\d{1,10}$/.test(retry)) {
        return `HTTP 429; rate limited. Retry in ${retry} seconds.`;
      }
      const retryAt = retry === null ? Number.NaN : Date.parse(retry);
      return Number.isFinite(retryAt)
        ? `HTTP 429; rate limited. Retry after ${new Date(retryAt).toISOString()}.`
        : 'HTTP 429; rate limited. Retry later.';
    }
    default:
      return `HTTP ${response.status}; check Jira availability and the requested site.`;
  }
}

async function readJson(
  fetcher: typeof fetch,
  url: URL,
  context: string,
  authorization?: string,
): Promise<unknown> {
  const headers = new Headers({ Accept: 'application/json' });
  if (authorization !== undefined) headers.set('Authorization', authorization);
  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetcher(url, { method: 'GET', headers, redirect: 'error', signal });
  } catch {
    throw new Error(`${context}: request failed. Check network connectivity; redirects are not followed.`);
  }
  if (!response.ok) throw new Error(`${context}: ${httpError(response)}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${context}: Jira response could not be read as JSON.`);
  }
}

function parseComment(value: unknown, context: string): JiraAdfComment {
  if (
    !isRecord(value) ||
    typeof value.created !== 'string' ||
    !timestamp.test(value.created) ||
    !Number.isFinite(Date.parse(value.created)) ||
    !isAdfDocument(value.body)
  ) {
    throw new Error(`${context}: invalid comment timestamp or ADF body.`);
  }
  const name = isRecord(value.author) ? value.author.displayName : undefined;
  return {
    author: typeof name === 'string' && name.trim() !== '' ? name : null,
    createdAt: value.created,
    body: value.body,
  };
}

async function collectComments(
  fetcher: typeof fetch,
  issueUrl: URL,
  context: string,
  authorization: string,
): Promise<JiraAdfComment[]> {
  const comments: JiraAdfComment[] = [];
  const url = new URL(`${issueUrl.pathname}/comment`, issueUrl);
  url.searchParams.set('orderBy', 'created');
  let startAt = 0;
  for (;;) {
    url.searchParams.set('startAt', String(startAt));
    const page = await readJson(fetcher, url, context, authorization);
    if (
      !isRecord(page) ||
      page.startAt !== startAt ||
      !isOffset(page.total) ||
      !isOffset(page.maxResults) ||
      !Array.isArray(page.comments) ||
      page.comments.length > page.maxResults
    ) {
      throw new Error(`${context}: invalid pagination metadata.`);
    }
    const end = startAt + page.comments.length;
    if (end > page.total || (end < page.total && end === startAt)) {
      throw new Error(`${context}: inconsistent or stalled pagination.`);
    }
    for (const item of page.comments) comments.push(parseComment(item, context));
    if (end === page.total) break;
    startAt = end;
  }
  return comments.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export async function collectJiraIssue(
  reference: JiraReference,
  credentials: JiraCredentials,
  fetcher: typeof fetch = fetch,
): Promise<JiraAdfIssue> {
  if (!tenantHost.test(reference.hostname)) throw new Error('Jira site must be a valid atlassian.net tenant.');
  if (!issueKey.test(reference.issueKey)) throw new Error('Invalid Jira issue key.');
  const origin = new URL(`https://${reference.hostname}`);
  const context = `Jira ${reference.issueKey} on ${origin.hostname}`;
  const tenant = await readJson(fetcher, new URL('/_edge/tenant_info', origin), `${context} tenant lookup`);
  if (!isRecord(tenant) || typeof tenant.cloudId !== 'string' || !cloudId.test(tenant.cloudId)) {
    throw new Error(`${context} tenant lookup: invalid Jira cloud ID.`);
  }
  const authorization = `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString('base64')}`;
  const base = `https://api.atlassian.com/ex/jira/${tenant.cloudId}/rest/api/3/issue/`;
  const url = new URL(reference.issueKey, base);
  url.searchParams.set('fields', 'summary,description');
  const issue = await readJson(fetcher, url, `${context} issue details`, authorization);
  if (
    !isRecord(issue) ||
    typeof issue.key !== 'string' ||
    !issueKey.test(issue.key) ||
    !isRecord(issue.fields) ||
    typeof issue.fields.summary !== 'string'
  ) {
    throw new Error(`${context} issue details: invalid issue key or summary.`);
  }
  const { description, summary } = issue.fields;
  if (description !== null && !isAdfDocument(description)) {
    throw new Error(`${context} issue details: missing or invalid ADF description.`);
  }
  return {
    id: issue.key,
    title: summary,
    url: new URL(`/browse/${issue.key}`, origin).href,
    description,
    comments: await collectComments(fetcher, new URL(issue.key, base), `${context} comments`, authorization),
  };
}

export function jiraIssueToMarkdown(issue: JiraAdfIssue): JiraIssue {
  const convert = (body: AdfDocument, section: string): string => {
    try {
      return adfToMarkdown(body);
    } catch (error) {
      throw new Error(`Jira ${issue.id} ${section}: ADF conversion failed.`, { cause: error });
    }
  };
  const description = issue.description === null ? '' : convert(issue.description, 'description');
  return {
    ...issue,
    description: description === '' ? null : description,
    comments: issue.comments.map((comment, index) => ({
      ...comment,
      body: convert(comment.body, `comment ${index + 1}`),
    })),
  };
}
