# Git Context in Reviews — Design Spec

## Summary

Add git context to roborev reviews in three ways:

1. **Always show repo node** — eliminate the single-repo special case; reuse the same collapsible repo header from multi-repo mode
2. **Changed files in tree** — expand a review to see its changed files (like SCM Changes); click to open a diff
3. **Webview commit details** — horizontal split with review output on top, commit message + diffstat on bottom

## 1. Always Show Repo Node

**Current behavior:** In single-repo mode, the tree skips the repo header and shows status groups (Needs Attention, Passed, etc.) directly at root. Branch is only visible in the empty-state message.

**New behavior:** Always render the repo node as the root, identical to multi-repo mode. One repo = one collapsible node with branch in the description. This eliminates the `multiRepo` branching in `review-tree.ts` and the single-repo special case in `getRootItems()`.

**Tree structure (single repo):**
```
▸ repo-name                         main · 3 reviews, 1 active
  ▸ Needs Attention (1)
  ▸ Passed (2)
```

### Files changed

- `src/review-tree.ts` — remove `multiRepo` getter, unify `getRootItems()` to always produce repo nodes

## 2. Changed Files as Tree Children

Each review node becomes expandable. Children are the files changed in that commit.

**Data source:** `git -C <repo-path> diff-tree --no-commit-id -r --name-status <sha>` returns lines like:
```
M	src/review-tree.ts
A	src/git-content-provider.ts
D	src/old-thing.ts
```

**Tree structure:**
```
▸ a1b2c3d — fix auth bug             claude-code  15m ago
    M  review-tree.ts
    A  git-content-provider.ts
    D  old-thing.ts
```

**File node details:**
- Label: basename of the file
- Description: parent directory path (if not repo root)
- Icon: status-based — green for added, red for deleted, yellow/default for modified (using `ThemeColor`)
- Click: opens `vscode.diff(parentUri, commitUri, title)` via the TextDocumentContentProvider

**Fetching strategy:** lazy, on first expand of a review node. Cache the file list on the `ReviewTreeItem` so repeated collapse/expand doesn't re-shell-out.

**No cap on file count** for v1 — large commits show all files; user can collapse the review node.

### Files changed

- `src/review-tree.ts` — review items get `Collapsed` state; new `getChildren` branch for review items; new `ChangedFileItem` class; cache for file lists
- `src/roborev-client.ts` — new `gitDiffTree(repoPath, sha)` method returning `{ status: string; path: string }[]`
- `src/types.ts` — new `ChangedFile` interface: `{ status: "A" | "M" | "D" | "R" | "C"; path: string }`

## 3. TextDocumentContentProvider for Diffs

New file `src/git-content-provider.ts`. Registers a `roborev-git` URI scheme.

**URI format:** `roborev-git:<file-path>?repo=<repo-path>&sha=<sha>`

**Resolution:** calls `git -C <repo-path> show <sha>:<file-path>` and returns the content as a string.

**Diff construction:**
- Left side: `sha~1` (parent commit)
- Right side: `sha` (the commit itself)
- Added files: left side returns empty string
- Deleted files: right side returns empty string
- Title: `filename (short-sha)`

**Registration:** once at extension activation in `extension.ts`, disposed on deactivation.

### Files changed

- `src/git-content-provider.ts` — new file: `GitContentProvider` class implementing `TextDocumentContentProvider`
- `src/roborev-client.ts` — new `gitShowFile(repoPath, sha, filePath)` method
- `src/extension.ts` — register the content provider and URI scheme

## 4. Webview Horizontal Split

The existing webview shows: header bar, action buttons, review output markdown.

**New layout:**
```
┌────────────────────────────────────────────┐
│  Header (verdict, sha, branch, agent, time)│
│  [Close/Resolve] [Open TUI]               │
├────────────────────────────────────────────┤
│                                            │
│  Review output (markdown)                  │
│                                            │
├────────────────────────────────────────────┤
│  Commit Details                            │
│  ──────────────                            │
│  Full commit message body                  │
│                                            │
│  Files changed (3)                         │
│   M  src/review-tree.ts                    │
│   A  src/git-content-provider.ts           │
│   D  src/old-thing.ts                      │
└────────────────────────────────────────────┘
```

**Data source:** `git -C <repo-path> show --stat --format=%B <sha>` returns full commit message + diffstat in one call.

**Bottom pane styling:**
- Subtle border separator (reuse `--vscode-widget-border`)
- Commit body rendered as preformatted text
- Diffstat in monospace, slightly muted color
- Not resizable for v1 — natural content flow

**Data flow:** `extension.ts` fetches commit details when `showReview` is called, passes to webview alongside the existing review data.

### Files changed

- `src/roborev-client.ts` — new `gitCommitDetails(repoPath, sha)` method returning `{ message: string; diffstat: string }`
- `src/review-webview.ts` — accept commit details in `show()`, add bottom pane HTML/CSS to `buildHtml()`
- `src/extension.ts` — fetch commit details and pass to webview manager

## Non-Goals

- Resizable split pane in the webview
- File count cap / truncation in tree
- Inline diff in the webview (diffs open in VS Code's native diff editor)
- Dependency on VS Code's built-in git extension
