# DevContext V1 capability map

The user approved these capability boundaries. See the [V1 specification](../tasks/SPEC.md) for shared requirements and approval status.

| ID | Responsibility | Depends on | Specification |
| --- | --- | --- | --- |
| `jira-collection` | Issue details, visible comments, ADF conversion | — | [Jira collection](SPEC-jira-collection.md) |
| `github-collection` | PR details, review filtering, complete conversations | — | [GitHub collection](SPEC-github-collection.md) |
| `report-rendering` | Built-in and custom template validation and rendering | — | [Report rendering](SPEC-report-rendering.md) |
| `cli` | Input and credential routing, orchestration, safe local output | Both collectors and renderer | [CLI](SPEC-cli.md) |

Dependency order: the collectors and renderer are independently testable; the CLI composes them. These are code boundaries, not separate packages.
