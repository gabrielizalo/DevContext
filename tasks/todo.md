# DevContext V1 — implementation checklist

**Status: Approved.** Source: [spec](SPEC.md) and [plan](plan.md). Use one `/gabo-build` invocation per task.

From Task 02 onward, run `pnpm run build`, `pnpm run typecheck`, `pnpm run lint`, and the indicated focused test. `pnpm test` uses Node's test discovery when no file is supplied. Test imports use compiled output.

## Task 01: Bootstrap the package

- [x] Set up one Node.js 24 npm package, strict TypeScript, build, typecheck, lint and test scripts. Add the shared report data types as the first compile target. Set the intended `devcontext` bin path but do not advertise a runnable CLI until Task 05.
- **Acceptance:** Clean install and toolchain commands work. pnpm enforces a strict 24-hour minimum release age without exceptions. The shared model defines report metadata and independent Jira and GitHub collections without network, template or filesystem behavior.
- **Verify:** Run `pnpm install --frozen-lockfile`, `pnpm run build`, `pnpm run typecheck`, `pnpm run lint` and `pnpm test`. No behavioral tests are expected until Task 02.
- **Depends on:** None. **Scope (M):** package manifest, lockfile, TypeScript and lint configuration, report model.

## Task 02: Collect Jira issues and comments

- [x] Fetch issue fields and all visible comment pages from the documented Jira connection. Validate payloads and retain ADF for conversion.
- **Acceptance:** A mocked two-site case uses one credential set, validates tenant lookup and gateway destinations, and checks that authenticated reads reject redirects. Comment pagination preserves complete bodies and chronological order. Verified empty data is distinct from failed or stalled pages.
- **Verify:** `pnpm test tests/jira.test.mjs`. Start the authorized Jira compatibility check if resources are available; never store tokens or real response bodies in fixtures.
- **Depends on:** 01. **Scope (S):** Jira collector and tests.

## Task 03: Convert Jira ADF to Markdown

- [x] Convert fetched descriptions and comment bodies. Emit readable fallbacks for valid unsupported nodes; do not download binaries.
- **Acceptance:** Synthetic ADF preserves text and supported structures, including nested lists, tables and code. Unsupported media or nodes have visible fallbacks. Malformed ADF fails instead of being rendered as empty.
- **Verify:** `pnpm test tests/adf.test.mjs tests/jira.test.mjs`.
- **Depends on:** 02. **Scope (M):** ADF converter, Jira collector and tests.

### Checkpoint after Tasks 01–03

- [x] Build, typecheck, lint and all tests pass. Jira collection and conversion are verified with mocks; live credential verification is pending.

## Task 04: Render the default report

- [x] Render the built-in Markdown report from normalized fixtures before wiring it into the CLI.
- **Acceptance:** Golden cases cover Jira-only, GitHub-only, mixed inputs, order within each platform and verified empty sections. Preserve raw source bodies. Absent platforms render no sections.
- **Verify:** `pnpm test tests/report.test.mjs tests/jira.test.mjs`.
- **Depends on:** 01 (shared model). **Scope (S):** renderer and report tests.

## Task 05: Publish the first Jira report

- [ ] Wire help, URL validation and Jira-only runs to `.env`, the collector, default renderer and local output. Ignore `reports/` before adding the writer.
- **Acceptance:** One or more Jira URLs, including repeats, produce one report with matching local metadata and filename. Validate all inputs before requests. No GitHub credentials are needed. Missing credentials, retrieval/conversion failures and publication errors produce no new completed file; same-second runs never overwrite.
- **Verify:** `pnpm test tests/cli.test.mjs tests/report-file.test.mjs`; run `node dist/cli.js --help` without `.env`; run `git check-ignore .env reports/example.md`.
- **Depends on:** 02, 03, 04. **Scope (M):** CLI, report writer, two focused tests and `.gitignore`.

### Checkpoint after Tasks 04–05

- [ ] Build, typecheck, lint and all tests pass. Review one synthetic Jira report and verify output behavior under a collision and an unsuccessful invocation.

## Task 06: Collect GitHub PRs and submitted reviews

- [ ] Add GitHub URL routing and collection of PR metadata, general comments and submitted review bodies.
- **Acceptance:** GitHub-only runs need no Jira credentials. Mixed runs include every resource in platform order. Traverse comment and review pages; omit blank or pending review bodies. Required GraphQL data errors fail the whole run. Inline conversations are added in Task 07.
- **Verify:** `pnpm test tests/github.test.mjs tests/cli.test.mjs`; start the authorized private-PR credential check if possible.
- **Depends on:** 05. **Scope (M):** GitHub collector, CLI and tests.

## Task 07: Include unresolved review threads

- [ ] Collect review-thread pages and all reply pages for included threads. Render threads and replies alongside general comments and review bodies.
- **Acceptance:** Resolved threads never appear. Unresolved and outdated threads retain every reply and display available file, line, author, time and link metadata. No duplicate inline comments or invented line numbers. Failure fetching a required reply page prevents publication.
- **Verify:** `pnpm test tests/github.test.mjs tests/report.test.mjs tests/cli.test.mjs`; finish the authorized private-PR check before claiming minimum token permissions.
- **Depends on:** 06. **Scope (M):** GitHub collector, renderer and tests.

### Checkpoint after Tasks 06–07

- [ ] Build, typecheck, lint and all tests pass. Review a mixed report that spans all four GitHub paginated connections. Confirm no completed report if one required source fails.

## Task 08: Render custom templates

- [ ] Add `--template` and the approved placeholder and loop syntax. Use the same collection data as the default report.
- **Acceptance:** Repeated loops, zero iterations, static text and raw Markdown match the spec. Jira titles render unchanged. Invalid fields or syntax are reported with location before API calls, including inside empty loops. Inserted text is not reinterpreted.
- **Verify:** `pnpm test tests/report.test.mjs tests/cli.test.mjs` with valid and invalid template fixtures.
- **Depends on:** 04, 05, 07. **Scope (M):** renderer, CLI, tests and synthetic template fixture.

## Task 09: Document and smoke-test local use

- [ ] Document local installation, `.env`, CLI usage, template syntax, ADF limits, errors and safe handling of generated reports. Add a synthetic `.env.example` with no real values.
- **Acceptance:** Document only token configurations already verified; label pending checks explicitly. Local package exposes `devcontext`, requires no other CLI at runtime, and never includes local secrets or reports. Preserve the user's existing README work when adding instructions.
- **Verify:** Run `pnpm run build`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm test`. Run `pnpm pack` into a disposable directory, inspect the archive contents, then install it there to confirm `devcontext --help`; do not publish.
- **Depends on:** 08. **Scope (M):** README, `.env.example` and package contents configuration if needed.

### Final verification

- [ ] Run `/gabo-test` after the build tasks: exercise mixed inputs, selective credentials, pagination, filtering, both template modes, redaction, publication failures and concurrent filename collisions.
- [ ] Record authorized live checks for Jira across two sites and GitHub against a private PR. Mark any unavailable access as pending, not passed.
- [ ] Confirm Atlassian's policy for public distribution before release. No publication is part of this checklist.
