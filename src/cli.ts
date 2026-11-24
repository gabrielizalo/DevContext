#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { collectJiraIssue, jiraIssueToMarkdown } from './jira.js';
import { publishReport, reportMetadata } from './report-file.js';
import type { JiraIssue } from './report-model.js';
import { renderDefaultReport } from './report.js';

const help = 'Usage: devcontext <jira-url> [<jira-url> ...]\n\nOptions:\n  -h, --help   Show help';
const tenantHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/i;
const jiraPath = /^\/browse\/([a-z][a-z0-9_]*-\d+)\/?$/i;

interface CliOptions {
  readonly cwd?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
}

function parseReference(input: string, index: number): { hostname: string; issueKey: string } {
  const raw = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:[?#].*)?$/i.exec(input);
  const issueKey = raw === null ? undefined : jiraPath.exec(raw[2])?.[1];
  if (
    raw !== null && issueKey !== undefined && !/[\s\\@]/.test(raw[1]) &&
    /^(?:[a-z0-9.-]+)(?::443)?$/i.test(raw[1])
  ) {
    const hostname = raw[1].replace(/:443$/, '').toLowerCase();
    if (tenantHost.test(hostname)) return { hostname, issueKey };
  }
  throw new Error(`URL ${index + 1}: expected https://<tenant>.atlassian.net/browse/<ISSUE-KEY>.`);
}

async function readCredentials(cwd: string): Promise<{ email: string; token: string }> {
  let env: ReturnType<typeof parseEnv>;
  try {
    env = parseEnv(await readFile(join(cwd, '.env'), 'utf8'));
  } catch {
    throw new Error('Could not read .env. Create a readable .env in the current directory.');
  }
  const email = env.JIRA_EMAIL;
  const token = env.JIRA_API_TOKEN;
  if (email === undefined || email.trim() === '' || token === undefined || token.trim() === '') {
    throw new Error('Set JIRA_EMAIL and JIRA_API_TOKEN in .env for Jira URLs.');
  }
  return { email, token };
}

export async function runCli(args: readonly string[], options: CliOptions = {}): Promise<number> {
  const { cwd = process.cwd(), now = () => new Date(), stdout = console.log, stderr = console.error } = options;
  try {
    let argsResult: ReturnType<typeof parseArgs<{ options: { help: { type: 'boolean'; short: 'h' } }; allowPositionals: true }>>;
    try {
      argsResult = parseArgs({
        args: [...args],
        options: { help: { type: 'boolean', short: 'h' } },
        allowPositionals: true,
      });
    } catch {
      throw new Error('Invalid arguments. Run devcontext --help for usage.');
    }
    if (argsResult.values.help === true) {
      stdout(help);
      return 0;
    }
    if (argsResult.positionals.length === 0) {
      throw new Error('Provide at least one Jira issue URL. Run devcontext --help for usage.');
    }
    const references = argsResult.positionals.map(parseReference);
    const credentials = await readCredentials(cwd);
    const issues: JiraIssue[] = [];
    for (const reference of references) {
      const issue = await collectJiraIssue(reference, credentials, options.fetch);
      issues.push(jiraIssueToMarkdown(issue));
    }
    const report = reportMetadata(now());
    const content = renderDefaultReport({ report, jira: { issues }, github: { pullRequests: [] } });
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
