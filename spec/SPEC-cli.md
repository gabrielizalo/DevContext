# Specification: CLI — V1

Status: Proposed contract. See the [V1 specification](../tasks/SPEC.md).

## Required behavior

Accept any nonempty combination of supported issue and PR URLs as positional arguments, without subcommands or a fixed resource limit. Detect type from each URL. `--template <path>` optionally selects one UTF-8 local Markdown template; relative paths are relative to the current working directory. Provide help, actionable errors, and one success message with the report path. Do not print the report body.

Users create and store tokens in `.env`. Do not offer sign-in, token creation, a credential store, a credential upload, or a vendor backend. Require credentials only for referenced services. Validate source hosts, use HTTPS, and never forward credentials across redirects.

## Proposed CLI and output contract

- Support `https://<tenant>.atlassian.net/browse/<ISSUE-KEY>` and `https://github.com/<owner>/<repo>/pull/<number>`, allowing an optional trailing slash. Ignore query strings and fragments for lookup. Reject custom domains, lookalike hosts, nondefault ports, user info and unsupported URL paths before network access. `--help` works without credentials; no URLs otherwise is an error.
- Resolve `.env` only from the invocation directory; parse it as data, not shell code. Read the selected service keys from the resulting object rather than mutating the process environment. Validate input URLs, template and required credentials before source requests. Preserve duplicate URL occurrences in the report, including two URLs that normalize to the same reference. Duplicate inputs never overwrite or hide other inputs.
- Publish one UTF-8 Markdown file under `reports/` in the current directory after successful collection, conversion and rendering. Use one local timestamp for both metadata and `DevContext-report-YYYYMMDD-HHmmss.md`. On collision use `-2`, `-3`, and so on before `.md`. Stage the completed bytes in the same directory under a non-report name and publish atomically without replacing an existing file. Fail rather than use an overwrite-capable fallback. Clean up the staging file; if cleanup fails after publication, warn without reporting the completed invocation as failed. Restrict local file permissions where the platform supports it.
- Return zero on success and nonzero on failure. Errors go to stderr and identify the failing input or stage and next action, without raw response bodies, credential values, query strings or authorization headers. Apply bounded request timeouts. V1 need not retry automatically; surface rate limiting and a usable retry time if supplied. Retrieval across pages is not a point-in-time snapshot.
- Ignore `reports/` and local credentials/config in Git. Document that reports can contain confidential content and that the MIT license covers DevContext code, not retrieved content.

## Acceptance

Mocked end-to-end tests verify CLI help, all source combinations, selective credentials, multiple authorized Jira sites, safe hostname handling, read-only network operations, collision avoidance, publication failures, and no report from an unsuccessful run.
