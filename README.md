# DevContext
A lightweight, open-source CLI that collects context from Jira issues and GitHub pull requests into customizable Markdown reports, including unresolved review conversations.

DevContext reads from the official APIs. It does not modify Jira or GitHub, send reports elsewhere, or use AI.

## Build and run locally

Use Node.js 24 and pnpm 12.18.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/cli.js --help
```

For a local `devcontext` command, run `pnpm pack`, then install the resulting tarball locally with `pnpm add /absolute/path/to/the-tarball.tgz` and use `pnpm exec devcontext`. Once installed, the CLI needs Node.js, not Git, GitHub CLI, or Atlassian CLI.

## Credentials

Create `.env` in the directory where you run the CLI. Use [`.env.example`](.env.example) as a starting point. Set only the keys for the services you request:

- Jira: `JIRA_EMAIL` and `JIRA_API_TOKEN`. The same credential set is used across all requested Jira Cloud sites. It must be accepted by Atlassian's API gateway and have read access to each issue and its comments. The CLI does not switch authentication methods.
- GitHub: `GITHUB_TOKEN`. The token must allow reading the requested repositories and their PR conversations through GitHub GraphQL. Prefer a fine-grained token limited to relevant repositories.

Live verification of multi-site Jira credentials and minimum fine-grained GitHub permissions is pending. Do not commit or share `.env`.

## Collect a report

```sh
devcontext https://example.atlassian.net/browse/OPS-7
devcontext https://github.com/example/widget/pull/2
devcontext https://github.com/example/widget/pull/2 https://example.atlassian.net/browse/OPS-7
devcontext https://example.atlassian.net/browse/OPS-7 --template ./custom.md
```

From the source checkout, replace `devcontext` with `node dist/cli.js`. Pass any number of supported URLs. The default template lists Jira issues first, then GitHub PRs, preserving input order within each platform.

Reports go to `reports/DevContext-report-YYYYMMDD-HHmmss.md` in your current directory. Runs in the same second get numeric suffixes instead of overwriting existing files. If required data cannot be retrieved, converted, or rendered, the command exits nonzero without publishing a new report. Check the reported URL, credential access, network or rate limit, and `reports/` permissions as applicable. Report publication uses hard links; the destination filesystem must support them.

## Custom templates

Provide a UTF-8 Markdown file. Use `{{report.date}}` and `{{report.time}}` anywhere. Use field placeholders inside a collection loop:

```markdown
# Work context

{{#each jira.issues}}
## {{id}} — {{title}}
{{description}}
{{/each}}

{{#each github.pullRequests}}
## {{repository}} #{{number}} — {{title}}
{{comments}}
{{/each}}
```

Jira fields: `id`, `title`, `description`, `comments`, `url`. GitHub fields: `repository`, `number`, `title`, `description`, `comments`, `url`. Loops may repeat but cannot nest. Empty collections render zero iterations; empty descriptions and conversations render `None`. Unknown fields and malformed tags report a file location. Inserted content is not interpreted as template syntax.

Jira ADF conversion preserves common text structures. Media and unsupported structures use readable labels where possible, and binary attachments are not downloaded. GitHub Markdown is preserved as returned. Resolved inline threads are excluded; outdated unresolved threads are included and labeled.

## Protect reports

Reports can contain confidential work. Keep them local unless you have permission to share them, and inspect Git's staged files before committing. The MIT license covers DevContext's code, not retrieved content.
