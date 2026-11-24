#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { collectGitHubPullRequest } from './github.js';
import { collectJiraIssue, jiraIssueToMarkdown } from './jira.js';
import { publishReport, reportMetadata } from './report-file.js';
import type { GitHubPullRequest, JiraIssue } from './report-model.js';
import { compileTemplate, renderDefaultReport } from './report.js';

const help = 'Usage: devcontext <jira-url|github-pr-url> [...] [--template <path>]\n\nOptions:\n  --template <path>   Use a local Markdown template\n  -h, --help          Show help';
const argumentOptions = { help: { type: 'boolean', short: 'h' }, template: { type: 'string' } } as const;
const tenantHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/i;
const jiraPath = /^\/browse\/([a-z][a-z0-9_]*-\d+)\/?$/i;
const githubPath = /^\/([a-z\d](?:[a-z\d-]*[a-z\d])?)\/([a-z\d_.-]+)\/pull\/([1-9]\d*)\/?$/i;

type Reference =
  | { kind: 'jira'; hostname: string; issueKey: string }
  | { kind: 'github'; owner: string; repository: string; number: number };

interface CliOptions {
  readonly cwd?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
}

function parseReference(input: string, index: number): Reference {
  const raw = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:[?#].*)?$/i.exec(input);
  if (raw !== null && /^(?:[a-z0-9.-]+)(?::443)?$/i.test(raw[1])) {
    const hostname = raw[1].replace(/:443$/, '').toLowerCase();
    if (tenantHost.test(hostname)) {
      const issueKey = jiraPath.exec(raw[2])?.[1];
      if (issueKey !== undefined) return { kind: 'jira', hostname, issueKey };
    } else if (hostname === 'github.com') {
      const match = githubPath.exec(raw[2]);
      if (match !== null && match[2] !== '.' && match[2] !== '..' && Number(match[3]) <= 2_147_483_647) {
        return { kind: 'github', owner: match[1], repository: match[2], number: Number(match[3]) };
      }
    }
  }
  throw new Error(`URL ${index + 1}: expected https://<tenant>.atlassian.net/browse/<ISSUE-KEY> or https://github.com/<owner>/<repo>/pull/<number>.`);
}

async function readEnv(cwd: string): Promise<ReturnType<typeof parseEnv>> {
  try {
    return parseEnv(await readFile(join(cwd, '.env'), 'utf8'));
  } catch {
    throw new Error('Could not read .env. Create a readable .env in the current directory.');
  }
}

function credential(env: ReturnType<typeof parseEnv>, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === '') throw new Error(`Set ${key} in .env for the requested URLs.`);
  return value;
}

export async function runCli(args: readonly string[], options: CliOptions = {}): Promise<number> {
  const { cwd = process.cwd(), now = () => new Date(), stdout = console.log, stderr = console.error } = options;
  try {
    let argsResult: ReturnType<typeof parseArgs<{ options: typeof argumentOptions; allowPositionals: true; tokens: true }>>;
    try {
      argsResult = parseArgs({
        args: [...args],
        options: argumentOptions,
        allowPositionals: true,
        tokens: true,
      });
    } catch {
      throw new Error('Invalid arguments. Run devcontext --help for usage.');
    }
    if (argsResult.values.help === true) {
      stdout(help);
      return 0;
    }
    if (argsResult.positionals.length === 0) {
      throw new Error('Provide at least one Jira issue or GitHub pull request URL. Run devcontext --help for usage.');
    }
    const references = argsResult.positionals.map(parseReference);
    const templatePath = argsResult.values.template;
    let render = renderDefaultReport;
    if (templatePath !== undefined) {
      if (templatePath.trim() === '' || argsResult.tokens.filter(
        (token) => token.kind === 'option' && token.name === 'template',
      ).length > 1) throw new Error('Provide exactly one path for --template.');
      let source: string;
      try {
        const bytes = await readFile(resolve(cwd, templatePath));
        source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new Error(`Could not read Markdown template ${templatePath}. Check the path and UTF-8 encoding.`);
      }
      render = compileTemplate(source, templatePath);
    }
    const env = await readEnv(cwd);
    const jira = references.filter((reference) => reference.kind === 'jira');
    const github = references.filter((reference) => reference.kind === 'github');
    const jiraCredentials = jira.length === 0 ? undefined
      : { email: credential(env, 'JIRA_EMAIL'), token: credential(env, 'JIRA_API_TOKEN') };
    const githubToken = github.length === 0 ? undefined : credential(env, 'GITHUB_TOKEN');
    const issues: JiraIssue[] = [];
    const pullRequests: GitHubPullRequest[] = [];
    if (jiraCredentials !== undefined) {
      for (const reference of jira) {
        const issue = await collectJiraIssue(reference, jiraCredentials, options.fetch);
        issues.push(jiraIssueToMarkdown(issue));
      }
    }
    if (githubToken !== undefined) {
      for (const reference of github) {
        pullRequests.push(await collectGitHubPullRequest(reference, githubToken, options.fetch));
      }
    }
    const report = reportMetadata(now());
    const content = render({ report, jira: { issues }, github: { pullRequests } });
    let path: string;
    try {
      path = await publishReport(cwd, report, content, stderr);
    } catch {
      throw new Error('Could not publish the report. Check reports/ permissions and hard link support.');
    }
    stdout(`Report written to ${path}`);
    return 0;
  } catch (error) {
    stderr(error instanceof Error ? error.message : 'DevContext failed.');
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
