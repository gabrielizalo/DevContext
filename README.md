<p align="center">
  <img src="./_assets/devcontext-header.png" alt="DevContext by Gabo" width="830" />
</p>


# DevContext

Collect Jira Cloud issues and GitHub pull request context into one local Markdown report. DevContext reads from the official APIs. It does not modify Jira or GitHub, upload reports, or use AI.


## Build and run locally

Use Node.js 24 and pnpm 12.18.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/cli.js --help
```

To use the packaged CLI, run `pnpm pack`, then install the tarball in a separate local project with `pnpm add /absolute/path/to/the-tarball.tgz`. Run it there as `pnpm exec devcontext`. At runtime, DevContext needs Node.js, not Git, GitHub CLI, or Atlassian CLI.


## Credentials

Create `.env` in the directory where you run the CLI. Use [`.env.example`](.env.example) as a starting point. Set only the keys for the services you request:

- Jira: `JIRA_EMAIL` and `JIRA_API_TOKEN`. The same credential set is used across all requested Jira Cloud sites. It must be accepted by Atlassian's API gateway and have read access to each issue and its comments. The CLI does not switch authentication methods.
- GitHub: `GITHUB_TOKEN`. The token must allow reading the requested repositories and their PR conversations through GitHub GraphQL. Prefer a fine-grained token limited to relevant repositories.

Jira-only, GitHub-only, and mixed runs have been tested against live resources. Multi-site Jira authentication and minimum fine-grained GitHub permissions still need verification. Do not commit or share `.env`.


## Collect a report

```sh
node dist/cli.js https://example.atlassian.net/browse/OPS-7
node dist/cli.js https://github.com/example/widget/pull/2
node dist/cli.js https://example.atlassian.net/browse/OPS-7 https://github.com/example/widget/pull/2
```

Pass one or more URLs in any order. The default report lists Jira issues first, then GitHub PRs, preserving input order within each platform. Each resource has a top-level identifier, its title and description, and its own `Jira Comments` or `GitHub Comments` section.

- **Jira:** Includes all comments visible to your account. Converts common formatting from Atlassian Document Format (ADF) to Markdown. Unsupported inline formatting, such as text color, is omitted without losing the text. Media and unsupported blocks use readable fallbacks; attachments are not downloaded.
- **GitHub:** Includes general PR comments, non-empty submitted review summaries, and unresolved inline review threads with their opening comments and replies. Pending reviews and resolved threads are omitted. Outdated unresolved threads are labeled. Supported `<details>` blocks in retained conversation entries become visible text instead of clickable toggles.

Reports go to `reports/DevContext-report-YYYYMMDD-HHmmss.md` in your current directory. Runs in the same second get numeric suffixes instead of overwriting existing files. If required data cannot be retrieved, converted, or rendered, the command exits nonzero without publishing a new report. Check the reported URL, credential access, network or rate limit, and `reports/` permissions as applicable. Report publication uses hard links; the destination filesystem must support them.


## Custom templates

Pass a UTF-8 Markdown file with `--template`, for example:

```sh
node dist/cli.js https://example.atlassian.net/browse/OPS-7 --template ./custom.md
```

Use `{{report.date}}` and `{{report.time}}` anywhere. Use resource fields inside their collection loops:

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

- Jira fields: `id`, `title`, `description`, `comments`, `url`.
- GitHub fields: `repository`, `number`, `title`, `description`, `comments`, `url`.
- Loops may repeat but cannot nest.
- Empty collections render zero iterations; empty descriptions and conversations render `None`.
- Unknown fields and malformed tags report a file location.
- Inserted content is not interpreted as template syntax.
- Opt in to heading nesting for `description` and `comments` with `| nest N`, where `N` is the parent heading level (1–5). For example, below a `###` heading, `{{description | nest 3}}` changes imported `#` headings to `####`. Below a `####` heading, `{{comments | nest 4}}` starts comment headings at `#####`. Heading levels stop at `######`; fenced code is preserved.


## Development checks

```sh
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm test
```

The automated tests use synthetic fixtures and do not need live credentials.


## Protect reports

Reports can contain confidential work. Keep them local unless you have permission to share them, and inspect Git's staged files before committing. The MIT license covers DevContext's code, not retrieved content.
