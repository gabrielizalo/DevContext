# Specification: Report rendering — V1

Status: Proposed contract. See the [V1 specification](../tasks/SPEC.md).

## Required behavior

Templates control presentation only. The default report is titled `Development Context`, lists the local generation date and time, and renders Jira issues before GitHub PRs. Use each platform's input order. Each resource shows identifier, title, source URL, description, and comments or conversations. Skip absent platform sections. Use `None` for verified empty descriptions or conversations; do not substitute it for unavailable data.

Custom templates can omit fields, reorder sections, and traverse either collection repeatedly. Preserve static text, headings and formatting even if a collection is empty. Insert values as raw Markdown, without execution, HTML escaping or recursive template interpretation.

## Proposed syntax and data

| Scope | Fields |
| --- | --- |
| Top level | `report.date` (`YYYY-MM-DD`), `report.time` (`HH:mm:ss`) |
| `jira.issues` loop | `id`, `title`, `description`, `comments`, `url` |
| `github.pullRequests` loop | `repository`, `number`, `title`, `description`, `comments`, `url` |

- Placeholders use `{{field}}`. Iterate with `{{#each jira.issues}}…{{/each}}` or `{{#each github.pullRequests}}…{{/each}}`. Report fields are also available inside loops. Allow surrounding whitespace inside tags. No nested loops, helpers, singular aliases, or arbitrary property access.
- Validate the entire template before rendering, including skipped loops; unknown fields or collections and malformed tags fail with the file path and a location. Leave literal text unchanged outside tags. `{{` is reserved in templates; write literal braces as Markdown character references when needed. This restriction does not apply to inserted values.
- Preserve original titles as returned, including an empty title; the identifier remains separate. Do not expose derived title fragments or infer workflow labels.
- The `comments` field is a Markdown block: entries carry author and source creation timestamp, plus original links when available. GitHub inline threads have a location and outdated marker where applicable; distinguish their replies structurally from top-level entries without modifying source bodies. Keep default and custom templates on the same validated collection model.

## Acceptance

Golden reports cover Jira-only, GitHub-only, mixed and truly empty sections. Custom templates can combine repeated loops with static headings, including headings around zero iterations. Values containing template syntax are left uninterpreted. Malformed templates fail before output.
