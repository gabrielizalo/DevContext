# Specification: DevContext — V1

**Status: Approved by the user. Ready for routing.** The Jira credential support decision is closed. Live credential checks and the public distribution check remain pending.

## Objective and boundaries

Developers can replace manual copy-and-paste with one complete Markdown report from any nonempty mix of Jira Cloud issue and GitHub.com PR URLs. The report preserves source language and content, subject to documented ADF conversion limits. DevContext collects context; it does not interpret it.

- Always: validate inputs, preserve source text, use read-only API operations, test with mocks and synthetic data, and distinguish empty data from failed retrieval.
- Ask first: change support for credentials, hosts, template syntax, report location, or failure semantics.
- Never: log or commit credentials; send credentials to the publisher or a third-party service; publish a partial report as complete.
- Out of scope: browser sign-in, hosted services, telemetry, AI, summaries, recommendations, code review, source mutations, diffs, CI/checks, other repository contents, associated-ticket discovery, attachment downloads, GUI, scheduling, background sync, output-path overrides, and persistent default templates. No Git, `gh`, Atlassian CLI, or IDE dependency at runtime.

## Existing baseline

The repository contains README, license, and Git ignore rules, but no CLI, tests, or package scripts. `.env` is already ignored. Ignoring `reports/` and documenting how to protect confidential reports are V1 requirements, not existing behavior.

## Capability specifications

See the [approved map](../spec/capability-map.md) and the V1 contracts for [Jira collection](../spec/SPEC-jira-collection.md), [GitHub collection](../spec/SPEC-github-collection.md), [report rendering](../spec/SPEC-report-rendering.md), and the [CLI](../spec/SPEC-cli.md).

## Proposed stack and engineering conventions

Use Node.js 24 LTS and strict TypeScript, one npm package exposing `devcontext`. Prefer Node built-ins for HTTP, argument parsing, `.env` parsing, and tests. Use `src/` for the entry point, collectors and renderer, `tests/` for tests and synthetic fixtures, and `dist/` for compiled output. Runtime files and credentials stay in the invocation directory. Public package publication is not implied by this specification.

Developer commands: `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run typecheck`, `pnpm run lint`, `pnpm test`, and `node dist/cli.js --help` once the CLI is implemented. Use Node's test runner. Test behavior rather than prescribing a coverage percentage. Narrow external data at the boundary, use explicit absence checks, and keep filtering independent of presentation. For example, a GitHub thread is included when `thread.isResolved === false`.

## Verification

- Test each collector with mocked paginated responses, missing optional metadata, empty data, and transport/API failures. Test redaction and reject redirects on authenticated requests.
- Test ADF conversion with representative synthetic nodes, including nested lists, tables, mentions, media, and unsupported nodes. Test custom template validation even for empty collections.
- Run CLI tests in temporary working directories with mocked APIs. Cover single-platform, multiple same-platform, and mixed invocations; two Jira sites sharing one credential set; duplicate inputs; no credentials for an absent platform; invalid arguments; same-second collisions; and no completed output on failure.
- Validate both real credential configurations against authorized non-production resources before declaring them supported. Include a two-site Jira case and a private GitHub PR containing multiple conversation types. No real tokens or retrieved content in fixtures or logs.

## Pending verification and release checks

1. **Jira token compatibility:** Verify which credentials Jira accepts through the single documented connection and what read access is sufficient for both issue and comment endpoints. Verify one working credential set across two authorized sites. Extra token permissions do not disqualify the token, and DevContext never uses them.
2. **GitHub token compatibility:** Verify the minimum fine-grained repository permissions for the full GraphQL query on a private PR. Do not silently fall back to a broader token.
3. **Public distribution:** Atlassian [documents personal API-token scripts](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/), but its [third-party integration guidance](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/) cautions against asking users to create tokens. Confirm applicability to a publicly distributed, local-only CLI before public release. This check does not authorize hosted sign-in or a change to the approved local-only model.

The next command is `/gabo-route`. If verification shows the documented Jira connection cannot meet the approved requirements, return to `/gabo-spec` before changing the authentication contract.
