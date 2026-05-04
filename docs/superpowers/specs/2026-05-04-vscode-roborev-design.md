# vscode-roborev — VS Code Extension Design Spec

## Overview

A VS Code extension that surfaces RoboRev code review findings inside the editor. V1 provides a sidebar tree view of reviews for the current workspace, a webview detail panel for reading findings, the ability to close/resolve reviews, and a shortcut to the RoboRev TUI.

## Goals

- See at a glance whether the current project has reviews that need attention
- Read full review findings without leaving VS Code
- Close/resolve findings from the editor
- Quick access to `roborev tui` via integrated terminal

## Non-Goals (v1)

- Code linking (inline decorations, diagnostics in Problems panel, CodeLens)
- Structured finding parsing (file:line extraction from markdown)
- Direct daemon API communication (REST/unix socket)
- Real-time streaming updates
- Multi-root workspace support
- Marketplace publishing

## Architecture

Four layers:

### 1. RoboRev CLI Client (`roborev-client.ts`)

TypeScript wrapper around the `roborev` CLI. Spawns child processes for:

- `roborev list --json --repo <path> [--status <status>] [--open] [--closed] [--limit N]` — fetch reviews
- `roborev show --json --job <id>` — fetch single review with full output
- `roborev close <id>` — toggle close/reopen a review

Responsibilities:
- Detect whether `roborev` binary is available (check `which roborev`)
- Detect whether daemon is running (parse error output gracefully)
- Parse JSON responses into typed interfaces
- Handle timeouts (5s default for list/show, 10s for close)
- Run commands inside `flox activate` when a flox environment is present

### 2. Review Tree Provider (`review-tree.ts`)

Implements `vscode.TreeDataProvider<ReviewTreeItem>`. Organizes reviews into groups:

```
ROBOREV
├── 🔄 In Progress
│   └── <sha> — <commit subject>     <agent>  <relative time>
├── ❌ Needs Attention
│   └── <sha> — <commit subject>     <agent>  <relative time>
├── ✅ Passed
│   └── <sha> — <commit subject>     <agent>  <relative time>
└── 📋 History
    └── (older reviews, load more on expand)
```

**Group definitions:**
- **In Progress** — `status == "running"` or `status == "queued"`
- **Needs Attention** — `status == "done"` AND `verdict_bool == 0` (fail) AND `closed == false`. Also includes `status == "failed"` (agent errors) so they're visible.
- **Passed** — `status == "done"` AND (`verdict_bool == 1` (pass) OR `closed == true`)
- **History** — all completed reviews (done, failed, canceled, skipped) beyond the most recent 10 per group above, collapsed by default, loads in pages of 25

**Tree item display:**
- Label: `<short-sha> — <commit subject>` (subject truncated to 50 chars)
- Description: `<agent>  <relative time>` (e.g., "claude-code  15m ago")
- Icon: spinner (in-progress), red circle (needs attention), green check (passed)
- Tooltip: branch name, full commit message, job type
- Context value: used for right-click menu filtering (e.g., "reviewOpen" vs "reviewClosed")

**Refresh strategy:**
- Auto-refresh on window focus (`vscode.window.onDidChangeWindowState`)
- Manual refresh via toolbar button in sidebar header
- 60-second polling interval while VS Code is focused
- Polling pauses when VS Code loses focus (no background CPU waste)

### 3. Review Detail Webview (`review-webview.ts`)

Opens when a tree item is clicked. Single panel reuse — clicking a different review replaces the current panel content.

**Panel title:** `"RoboRev: <short-sha> — <commit subject>"`

**Layout:**
- **Header** — full commit SHA, branch, agent, timestamp, verdict badge (Pass/Fail/In Progress)
- **Action bar** — "Close/Resolve" button (or "Reopen" if already closed), "Open in TUI" button
- **Body** — review output rendered as HTML from markdown, with syntax highlighting for fenced code blocks
- **Closed state** — "Resolved" badge replaces verdict, close button becomes "Reopen"

**Styling:**
- Uses VS Code CSS variables (`--vscode-editor-background`, `--vscode-editor-foreground`, etc.)
- Matches user's light/dark/high-contrast theme automatically
- Minimal custom CSS — layout only, no design system
- Code blocks use `--vscode-textCodeBlock-background` for consistent appearance

**Messaging:**
- Webview posts messages to extension host: `{ command: 'close', jobId: string }`, `{ command: 'reopen', jobId: string }`, `{ command: 'openTui' }`
- Extension host posts state updates back: `{ type: 'update', review: ReviewData }`

**Markdown rendering:**
- Use a lightweight markdown-to-HTML library (marked) bundled with the extension
- Sanitize output to prevent XSS (strip scripts, event handlers)

### 4. Commands & Activation (`extension.ts`)

**Commands:**

| ID | Title | Trigger |
|----|-------|---------|
| `roborev.refresh` | RoboRev: Refresh Reviews | Sidebar toolbar button, command palette |
| `roborev.close` | RoboRev: Close Review | Tree item context menu, webview button |
| `roborev.reopen` | RoboRev: Reopen Review | Tree item context menu, webview button |
| `roborev.openTui` | RoboRev: Open TUI | Tree item context menu, command palette |
| `roborev.showReview` | RoboRev: Show Review | Tree item click (implicit) |

**Open TUI behavior:**
- Creates an integrated terminal named "RoboRev TUI"
- Sends `flox activate -c 'roborev tui'` (or `roborev tui` if no flox env)
- If a terminal named "RoboRev TUI" already exists and is alive, focuses it instead

**Activation events:**
- `workspaceContains:.roborev-id` — only activates when roborev is initialized for the repo
- Stays dormant in non-roborev workspaces

**Deactivation:**
- Disposes polling timer
- Disposes webview panel
- Disposes terminal (if created by extension)

## Data Types

Interfaces matching `roborev list --json` and `roborev show --json` output:

```typescript
interface ReviewJob {
  id: number;
  repo_id: number;
  repo: string;
  commit_id: number;
  git_ref: string;
  branch: string;
  agent: string;
  model: string;
  status: "queued" | "running" | "done" | "failed" | "canceled" | "skipped";
  job_type: string;
  review_type: string;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  closed: boolean;
  verdict_bool: number | null; // 0 = fail, 1 = pass, null = legacy/pending
}

interface ReviewDetail extends ReviewJob {
  output: string;       // markdown findings
  prompt: string;       // input prompt (not displayed, but available)
  subject: string;      // commit subject line
  author: string;       // commit author
}
```

## Project Structure

```
vscode-roborev/
├── src/
│   ├── extension.ts          # activate/deactivate, register commands
│   ├── roborev-client.ts     # CLI wrapper (list, show, close)
│   ├── review-tree.ts        # TreeDataProvider + TreeItem definitions
│   ├── review-webview.ts     # Webview panel creation + messaging
│   └── types.ts              # Interfaces for CLI JSON responses
├── media/
│   └── roborev-icon.svg      # Activity bar icon
├── package.json              # Extension manifest (contributes, activationEvents)
├── tsconfig.json
├── esbuild.config.mjs
└── .vscodeignore
```

## Tech Stack

- **Language:** TypeScript, strict mode
- **Target:** VS Code Extension API (minimum VS Code 1.85)
- **Bundler:** esbuild — single-file bundle for fast load
- **Runtime deps:** `marked` (markdown rendering)
- **Dev deps:** `@types/vscode`, `typescript`, `esbuild`, `@vscode/vsce`
- **No other runtime dependencies** — child_process and VS Code APIs cover everything

## Flox Environment

```toml
[install]
nodejs.pkg-path = "nodejs_22"
esbuild.pkg-path = "esbuild"
```

TypeScript and vsce installed via npm (project-local devDependencies).

## Error Handling

- **roborev not installed:** Show a tree item "RoboRev CLI not found" with a link to install instructions
- **Daemon not running:** Show reviews from last known state, display a warning item "Daemon not running — reviews may be stale"
- **CLI timeout:** Log to output channel, show stale data, retry on next poll
- **Empty state:** Show "No reviews found" with a description of how reviews get created
- **JSON parse failure:** Log raw output to output channel, show error tree item

## Future (v2+)

- Best-effort file:line extraction from finding markdown for inline decorations
- Diagnostics integration (Problems panel)
- Daemon REST API for real-time updates via `stream` endpoint
- Multi-root workspace support
- Status bar item showing count of findings needing attention
- CodeLens on affected files
