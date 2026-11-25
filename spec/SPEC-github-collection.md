# Specification: GitHub collection — V1

Status: Proposed contract. See the [V1 specification](../tasks/SPEC.md).

## Required behavior

For each GitHub.com PR, return the canonical repository identifier, PR number, URL, title, complete Markdown description, and relevant visible conversations. Include general PR comments and all comments and replies from review threads where `isResolved` is false, even if outdated, written by bots or the PR author, or claimed fixed. Use the original opening comment as the finding's context; do not generate a summary. Exclude entire resolved threads and all review-level bodies, regardless of author or thread status.

Include author, creation timestamp, body, and original comment link where available. Preserve thread grouping. Show file path and available line or range, marking historical line data as original and outdated threads as outdated. Never infer missing line numbers.

## Proposed adapter contract

- Use the official [GitHub GraphQL PR schema](https://docs.github.com/en/graphql/reference/pulls) at `https://api.github.com/graphql` with `GITHUB_TOKEN`. Fetch raw `body`, not `bodyHTML` or `bodyText`. Prefer a fine-grained token restricted to the relevant repositories; exact minimum permissions remain a verification item.
- Follow cursors for general PR comments, review threads, and all comments inside included threads. Do not fetch review-level bodies. A GraphQL error affecting collected data or a required connection, even in an HTTP 200 response, fails the invocation. Reject malformed or non-progressing pagination.
- Sort top-level items by creation instant, using the first comment's creation time for each thread. Sort replies oldest first. Break ties by source sequence within a type, with general comments before threads across types. Missing optional author/link/location metadata is not a retrieval failure.

## Acceptance

Single and multiple PRs render without Jira. Fixtures exercise every included connection across pages, author replies, outdated and resolved threads, omitted review-level bodies, and partial GraphQL failures.
