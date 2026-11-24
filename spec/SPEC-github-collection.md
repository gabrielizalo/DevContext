# Specification: GitHub collection — V1

Status: Proposed contract. See the [V1 specification](../tasks/SPEC.md).

## Required behavior

For each GitHub.com PR, return the canonical repository identifier, PR number, URL, title, complete Markdown description, and all relevant visible conversations. Include general comments and nonblank submitted review bodies. Include all comments and replies from threads where `isResolved` is false, even if outdated, written by bots or the PR author, or claimed fixed. Exclude entire resolved threads. An empty review body never suppresses its threads.

Include author, creation timestamp, body, and original comment or review link where available. Preserve thread grouping. Show file path and available line or range, marking historical line data as original and outdated threads as outdated. Never infer missing line numbers.

## Proposed adapter contract

- Use the official [GitHub GraphQL PR schema](https://docs.github.com/en/graphql/reference/pulls) at `https://api.github.com/graphql` with `GITHUB_TOKEN`. Fetch raw `body`, not `bodyHTML` or `bodyText`. Prefer a fine-grained token restricted to the relevant repositories; exact minimum permissions remain a verification item.
- Follow cursors for PR comments, reviews, review threads, and all comments inside included threads. Consume inline comments only from threads, not a second copy from review objects. A GraphQL error affecting collected data or a required connection, even in an HTTP 200 response, fails the invocation. Reject malformed or non-progressing pagination.
- Exclude pending review bodies; retain submitted, nonblank bodies regardless of review outcome. Whitespace alone does not count as a written review body. Preserve original content of nonblank bodies without trimming.
- Sort top-level items by creation instant, using the first comment's creation time for each thread. Sort replies oldest first. Break ties deterministically by source sequence within a type, with general comments before review bodies before threads across types. Missing optional author/link/location metadata is not a retrieval failure.

## Acceptance

Single and multiple PRs render without Jira. Fixtures exercise every connection across pages, author replies, outdated and resolved threads, written and empty reviews, and partial GraphQL failures. No inline comment appears twice because of alternate API representations.
