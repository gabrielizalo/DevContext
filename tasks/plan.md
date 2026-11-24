# Implementation plan: DevContext V1

**Status: Approved.**

Source: [approved V1 spec](SPEC.md) and [capability map](../spec/capability-map.md). The repository has no CLI or test harness yet. This plan does not change the spec.

## Approach

Build one working Jira report first. Reuse the same CLI and output behavior for GitHub, then add custom templates. Intermediate builds prove smaller paths; only the complete command is a V1 release candidate.

- **Boundaries:** Jira and GitHub collectors return normalized data without template or filesystem concerns. Use one small TypeScript model for report metadata, issues, PRs and their conversations. The renderer produces Markdown; the CLI routes URLs, reads selected credentials and publishes output. No adapter framework, plugin system, or separate packages.
- **Tooling:** Node.js 24, strict TypeScript, pnpm for dependency management, one npm package and Node's test runner. Use built-in argument, environment and HTTP support. Keep runtime dependencies out unless a concrete requirement warrants one. Use mocked API responses via an injected HTTP function. Test filesystem behavior in temporary directories.
- **Credential handling:** Validate the full input list and selected template before source requests. Keep `.env` values local to the command. Use only the documented API origins and operations, reject redirects, and redact errors. The CLI does not classify Jira tokens by permissions or retry using another auth method.
- **Output:** Finish collection, conversion and rendering before publication. Stage a complete file in `reports/`, then use a same-directory operation that publishes without overwriting (such as a hard link where supported). Test the supported Linux/WSL filesystem behavior. Do not fall back to an overwrite-capable operation.

## Sequence

The [task list](todo.md) owns completion state and detailed acceptance checks.

| Phase | Tasks | Checkpoint |
| --- | --- | --- |
| First Jira report | [01](todo.md#task-01-bootstrap-the-package), [02](todo.md#task-02-collect-jira-issues-and-comments), [03](todo.md#task-03-convert-jira-adf-to-markdown), [04](todo.md#task-04-render-the-default-report), [05](todo.md#task-05-publish-the-first-jira-report) | A mocked Jira invocation produces a complete report. Denied access and collisions are tested. |
| Full source coverage | [06](todo.md#task-06-collect-github-prs-and-submitted-reviews), [07](todo.md#task-07-include-unresolved-review-threads) | A mixed run includes all Jira issues and GitHub PRs and filters only the specified conversations. |
| Complete V1 | [08](todo.md#task-08-render-custom-templates), [09](todo.md#task-09-document-and-smoke-test-local-use) | All spec cases pass; credential and release checks have recorded outcomes. |

ADF conversion and the default renderer can be tested independently once the report model is set. Land tasks in list order to avoid concurrent edits to the entry point, renderer and shared tests. Run build, typecheck, lint and targeted tests per task. After all tasks, use `/gabo-test` for a cross-module pass, not as a substitute for per-task tests.

## Risks and verification gates

| Risk | Verification or response |
| --- | --- |
| Jira token or site access does not match the documented connection | Start the authorized compatibility check alongside Task 02 when resources are available. Verify one credential set across two Jira sites, including the issue and comment endpoints. Keep checks pending if access is unavailable. Do not add an authentication fallback. |
| GitHub accepts the token but returns incomplete GraphQL data | Test partial errors and every cursor with mocks. During Tasks 06–07, verify minimum fine-grained permissions against a private, non-production PR with representative conversations, including unresolved threads. Do not silently switch to a broader token. |
| Secret or confidential content escapes | Check request destinations and redirect behavior; verify credential redaction and Git ignore rules. `reports/example.md` is existing local work: do not read it into tests, overwrite it, or commit it. Use synthetic fixtures only. |
| Publication fails or two invocations share a timestamp | Test failed retrieval, conversion, rendering and publication; verify no new completed file remains on failure. Test concurrent publication, preservation of existing files, and cleanup after publication. |
| Atlassian policy may constrain public distribution | Resolve this separately before public release. Do not add hosted sign-in or make public distribution claims in this plan. |

No live credentials or third-party publication are needed to approve this plan. Use only authorized non-production resources for live checks. Keep compatibility claims pending until checks pass. If a documented API connection cannot meet the approved requirements, return to `/gabo-spec` before changing the contract.
