# Specification: Jira collection — V1

Status: Approved V1 contract. See the [V1 specification](../tasks/SPEC.md).

## Required behavior

For each input, return the canonical issue key, summary, browser URL, complete description, and all comments visible to the authenticated user. Preserve original language. Each comment carries its author, creation timestamp, and complete body. Sort oldest first by creation instant; retain source sequence for ties. Do not limit the number of issues or comments.

Use one user-managed Jira credential set from `.env` across all authorized sites in a run. Accept any token that Jira accepts through the documented connection and that can read the requested data. Do not inspect or reject tokens based on extra permissions. DevContext makes only read requests and never tries a second authentication method. If any requested issue cannot be read, report the error and write no report; do not fall back to anonymous access.

## Adapter contract

- Use [Jira Cloud REST v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/). Request the issue's summary and description, and fetch comments separately using the [paginated comments endpoint](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/#api-rest-api-3-issue-issueidorkey-comment-get). Construct the browser URL from the validated tenant and returned issue key. Advance using response pagination metadata; fail on malformed or non-progressing pages. Do not request or expose data from other endpoints except tenant lookup.
- Use one `JIRA_EMAIL` and one `JIRA_API_TOKEN`. For each supported `*.atlassian.net` tenant, use Atlassian's [documented cloud ID lookup](https://support.atlassian.com/jira/kb/retrieve-my-atlassian-sites-cloud-id/) without credentials, then call `https://api.atlassian.com/ex/jira/{cloudId}`. Document the token configuration verified against this connection; do not claim support for tokens that require a different connection.
- Convert ADF to Markdown: preserve paragraphs, headings, lists and nesting, tables, links, blockquotes, code blocks and conventional inline marks where representable. Preserve the original text of mentions when present. For media, attachments and unsupported nodes, include a readable labeled fallback, available human-readable text or safe source links, and any renderable child text. Do not fetch binaries or fabricate content. Malformed ADF is an error; valid but unsupported ADF is not.
- Normalize absent optional author metadata to an explicit unknown author; preserve real timestamps. A verified null or semantically empty description and a successfully exhausted empty comments collection are empty states. An omitted expected field, bad response, or failed conversion is not empty.

## Acceptance

Multiple issues retain input order, including across two authorized tenants using one credential set. Multi-page comment histories render completely in chronological order. Mocked requests demonstrate read-only behavior and no authentication fallback. Denied resources, failed pages, and malformed ADF fail the invocation. Legitimately empty sections and unsupported ADF nodes have distinguishable output.
