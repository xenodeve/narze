# Issue tracker: GitHub (via MCP)

Issues and PRDs for this repo live as GitHub issues. Use the GitHub MCP tools (`mcp_github_*`) for all operations.

## Conventions

- **Create an issue**: Use `mcp_github_create_issue`.
- **Read an issue**: Use `mcp_github_get_issue` and `mcp_github_get_pull_request_comments` if applicable.
- **List issues**: Use `mcp_github_list_issues` or `mcp_github_search_issues`.
- **Comment on an issue**: Use `mcp_github_add_issue_comment`.
- **Apply / remove labels**: Use `mcp_github_update_issue` with the `labels` parameter.
- **Close**: Use `mcp_github_update_issue` with `state: "closed"`.

The GitHub MCP server automatically handles repository context based on the configured environment.

## When a skill says "publish to the issue tracker"

Create a GitHub issue using `mcp_github_create_issue`.

## When a skill says "fetch the relevant ticket"

Fetch issue details using `mcp_github_get_issue`.
