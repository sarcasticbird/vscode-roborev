# Git Context in Reviews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add git context to roborev reviews — always show the repo/branch header, show changed files under each review with click-to-diff, and display commit details in the webview.

**Architecture:** Five incremental changes layered bottom-up: (1) unify the tree to always show repo nodes, (2) add git helper methods to the client, (3) register a TextDocumentContentProvider for diff content, (4) wire changed files into the tree as expandable children, (5) add commit details to the webview. Each task produces a buildable, testable state.

**Tech Stack:** TypeScript, VS Code Extension API, `git` CLI via `child_process.execFile`, `marked` for markdown rendering.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/review-tree.ts` | Modify | Remove single-repo special case; add expandable review nodes with changed file children |
| `src/roborev-client.ts` | Modify | Add `gitDiffTree`, `gitShowFile`, `gitCommitDetails` methods |
| `src/types.ts` | Modify | Add `ChangedFile` interface |
| `src/git-content-provider.ts` | Create | `TextDocumentContentProvider` for `roborev-git:` URI scheme |
| `src/review-webview.ts` | Modify | Accept commit details, render bottom pane with commit message + diffstat |
| `src/extension.ts` | Modify | Register content provider; pass commit details to webview |

---

### Task 1: Always Show Repo Node

**Files:**
- Modify: `src/review-tree.ts:58-201`

- [ ] **Step 1: Remove the `multiRepo` getter and unify `getRootItems()`**

In `src/review-tree.ts`, delete the `multiRepo` getter (lines 62-64) and replace the `getRootItems()` method. The single-repo branch (lines 158-171) is removed entirely. All modes use the multi-repo path (lines 174-200).

Replace the entire `getRootItems()` method with:

```typescript
private getRootItems(): ReviewTreeItem[] {
  if (!this.available || this.errorMessage) {
    const item = new ReviewTreeItem(
      this.errorMessage ?? "roborev CLI not found",
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon("warning");
    return [item];
  }

  if (this.repos.length === 0) {
    const item = new ReviewTreeItem(
      "No repos found",
      vscode.TreeItemCollapsibleState.None
    );
    item.description = "Open a workspace with git repos";
    return [item];
  }

  return this.repos.map((repo) => {
    const activeInRepo = repo.jobs.filter((j) => {
      const g = classifyReview(j);
      return g === "inProgress" || g === "needsAttention";
    }).length;

    const prefix = repo.branch ? `${repo.branch} · ` : "";
    let status: string;
    if (repo.jobs.length === 0) {
      status = "no reviews";
    } else if (activeInRepo > 0) {
      status = `${repo.jobs.length} reviews, ${activeInRepo} active`;
    } else {
      status = `${repo.jobs.length} reviews`;
    }

    const item = new ReviewTreeItem(
      repo.name,
      repo.jobs.length > 0
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon("repo");
    item.description = `${prefix}${status}`;
    item.repoName = repo.name;
    return item;
  });
}
```

Also delete the `multiRepo` getter:
```typescript
// DELETE these lines:
private get multiRepo(): boolean {
  return this.repoPaths.length > 1;
}
```

- [ ] **Step 2: Build and verify**

Run: `cd /Users/cdolan/Projects/vscode-roborev && node esbuild.config.mjs`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual test**

Open VS Code with a single-repo workspace. Verify:
- The repo node appears at root with the branch name in the description
- Status groups are nested under the repo node
- Collapsing and expanding the repo node works

- [ ] **Step 4: Commit**

```bash
git add src/review-tree.ts
git commit -m "refactor: always show repo node, remove single-repo special case"
```

---

### Task 2: Add Git Helper Methods to Client

**Files:**
- Modify: `src/types.ts:89` (append)
- Modify: `src/roborev-client.ts:121` (append new methods)

- [ ] **Step 1: Add `ChangedFile` interface to `types.ts`**

Append after the `classifyReview` function at the end of `src/types.ts`:

```typescript
export interface ChangedFile {
  status: "A" | "M" | "D" | "R" | "C";
  path: string;
}
```

- [ ] **Step 2: Add `gitDiffTree` method to `roborev-client.ts`**

Add this method to the `RoboRevClient` class, after the existing `gitCurrentBranch` method:

```typescript
gitDiffTree(repoPath: string, sha: string): Promise<ChangedFile[]> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", repoPath, "diff-tree", "--no-commit-id", "-r", "--name-status", sha],
      { timeout: 5_000 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        const files: ChangedFile[] = [];
        for (const line of stdout.trim().split("\n")) {
          if (!line) continue;
          const [status, ...pathParts] = line.split("\t");
          const filePath = pathParts.join("\t");
          if (status && filePath) {
            files.push({
              status: status.charAt(0) as ChangedFile["status"],
              path: filePath,
            });
          }
        }
        resolve(files);
      }
    );
  });
}
```

Add the import at the top of `roborev-client.ts`:

```typescript
import type { ReviewJob, ReviewShowResponse, ChangedFile } from "./types.js";
```

- [ ] **Step 3: Add `gitShowFile` method to `roborev-client.ts`**

Add this method to the `RoboRevClient` class, after `gitDiffTree`:

```typescript
gitShowFile(repoPath: string, sha: string, filePath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", repoPath, "show", `${sha}:${filePath}`],
      { timeout: 5_000, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve("");
          return;
        }
        resolve(stdout);
      }
    );
  });
}
```

- [ ] **Step 4: Add `gitCommitDetails` method to `roborev-client.ts`**

Add this method to the `RoboRevClient` class, after `gitShowFile`:

```typescript
gitCommitDetails(repoPath: string, sha: string): Promise<{ message: string; diffstat: string }> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", repoPath, "show", "--stat", "--format=%B", sha],
      { timeout: 5_000 },
      (error, stdout) => {
        if (error) {
          resolve({ message: "", diffstat: "" });
          return;
        }
        const parts = stdout.split("\n\n");
        const message = parts[0]?.trim() ?? "";
        const diffstat = parts.slice(1).join("\n\n").trim();
        resolve({ message, diffstat });
      }
    );
  });
}
```

- [ ] **Step 5: Build and verify**

Run: `cd /Users/cdolan/Projects/vscode-roborev && node esbuild.config.mjs`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Manual test the git methods**

In the VS Code debug console or a temporary test, verify:
- `gitDiffTree` returns file list for a known commit
- `gitShowFile` returns file content at a commit
- `gitCommitDetails` returns message and diffstat

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/roborev-client.ts
git commit -m "feat: add git helper methods for diff-tree, show-file, and commit details"
```

---

### Task 3: TextDocumentContentProvider for Diffs

**Files:**
- Create: `src/git-content-provider.ts`
- Modify: `src/extension.ts:1-6` (imports), `src/extension.ts:60-66` (registration)

- [ ] **Step 1: Create `src/git-content-provider.ts`**

```typescript
import * as vscode from "vscode";
import type { RoboRevClient } from "./roborev-client.js";

export const GIT_SCHEME = "roborev-git";

export class GitContentProvider implements vscode.TextDocumentContentProvider {
  private client: RoboRevClient;

  constructor(client: RoboRevClient) {
    this.client = client;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const repo = params.get("repo");
    const sha = params.get("sha");
    const filePath = uri.path;

    if (!repo || !sha || !filePath) {
      return "";
    }

    return this.client.gitShowFile(repo, sha, filePath);
  }
}

export function buildGitUri(repoPath: string, sha: string, filePath: string): vscode.Uri {
  return vscode.Uri.parse(
    `${GIT_SCHEME}:${filePath}?repo=${encodeURIComponent(repoPath)}&sha=${encodeURIComponent(sha)}`
  );
}
```

- [ ] **Step 2: Register the content provider in `extension.ts`**

Add import at the top of `src/extension.ts`:

```typescript
import { GitContentProvider, GIT_SCHEME } from "./git-content-provider.js";
```

Add registration inside `activate()`, after the `client` is created (after line 59) and before the tree provider:

```typescript
const gitContentProvider = new GitContentProvider(client);
context.subscriptions.push(
  vscode.workspace.registerTextDocumentContentProvider(GIT_SCHEME, gitContentProvider)
);
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/cdolan/Projects/vscode-roborev && node esbuild.config.mjs`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/git-content-provider.ts src/extension.ts
git commit -m "feat: add TextDocumentContentProvider for git file content"
```

---

### Task 4: Changed Files as Tree Children

**Files:**
- Modify: `src/review-tree.ts` (multiple sections)

This task makes review items expandable and adds changed file children.

- [ ] **Step 1: Add imports and new tree item class**

At the top of `src/review-tree.ts`, update the import from types:

```typescript
import { type ReviewJob, type ReviewGroup, type ChangedFile, classifyReview } from "./types.js";
```

Add import for the git content provider:

```typescript
import { buildGitUri } from "./git-content-provider.js";
```

Add import for `path` module:

```typescript
import * as path from "node:path";
```

At the bottom of the file, after the `ReviewTreeItem` class, add a new class for changed file items:

```typescript
export class ChangedFileItem extends vscode.TreeItem {
  constructor(
    file: ChangedFile,
    repoPath: string,
    sha: string
  ) {
    const basename = path.basename(file.path);
    const dirname = path.dirname(file.path);

    super(basename, vscode.TreeItemCollapsibleState.None);

    this.description = dirname === "." ? "" : dirname;
    this.resourceUri = vscode.Uri.file(path.join(repoPath, file.path));
    this.iconPath = ChangedFileItem.statusIcon(file.status);
    this.contextValue = "changedFile";

    const parentSha = `${sha}~1`;
    const leftUri = file.status === "A"
      ? vscode.Uri.parse(`roborev-git:${file.path}?repo=${encodeURIComponent(repoPath)}&sha=empty`)
      : buildGitUri(repoPath, parentSha, file.path);
    const rightUri = file.status === "D"
      ? vscode.Uri.parse(`roborev-git:${file.path}?repo=${encodeURIComponent(repoPath)}&sha=empty`)
      : buildGitUri(repoPath, sha, file.path);

    this.command = {
      command: "vscode.diff",
      title: "Show Diff",
      arguments: [leftUri, rightUri, `${basename} (${sha.slice(0, 7)})`],
    };
  }

  private static statusIcon(status: ChangedFile["status"]): vscode.ThemeIcon {
    switch (status) {
      case "A":
        return new vscode.ThemeIcon("diff-added", new vscode.ThemeColor("gitDecoration.addedResourceForeground"));
      case "D":
        return new vscode.ThemeIcon("diff-removed", new vscode.ThemeColor("gitDecoration.deletedResourceForeground"));
      case "M":
        return new vscode.ThemeIcon("diff-modified", new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"));
      case "R":
        return new vscode.ThemeIcon("diff-renamed", new vscode.ThemeColor("gitDecoration.renamedResourceForeground"));
      case "C":
        return new vscode.ThemeIcon("diff-modified", new vscode.ThemeColor("gitDecoration.modifiedResourceForeground"));
    }
  }
}
```

- [ ] **Step 2: Add file cache and repo path tracking to `ReviewTreeItem`**

Update the `ReviewTreeItem` class to store additional data:

```typescript
export class ReviewTreeItem extends vscode.TreeItem {
  group?: ReviewGroup;
  repoName?: string;
  jobId?: number;
  gitRef?: string;
  repoPath?: string;
  cachedFiles?: ChangedFile[];
}
```

- [ ] **Step 3: Update `getChildren` to handle review item expansion**

Replace the `getChildren` method in `ReviewTreeProvider`:

```typescript
async getChildren(element?: ReviewTreeItem): Promise<(ReviewTreeItem | ChangedFileItem)[]> {
  if (!element) {
    return this.getRootItems();
  }
  if (element.repoName && !element.group) {
    return this.getRepoGroups(element.repoName);
  }
  if (element.group) {
    const jobs = element.repoName
      ? this.getRepoJobs(element.repoName)
      : this.getAllJobs();
    return this.getGroupChildren(jobs, element.group);
  }
  if (element.jobId && element.gitRef && element.repoPath) {
    return this.getChangedFiles(element);
  }
  return [];
}
```

Note: the return type changes from `ReviewTreeItem[]` to `Promise<(ReviewTreeItem | ChangedFileItem)[]>`, and the method becomes `async`.

- [ ] **Step 4: Add `getChangedFiles` method**

Add this method to `ReviewTreeProvider`, after `getGroupChildren`:

```typescript
private async getChangedFiles(element: ReviewTreeItem): Promise<ChangedFileItem[]> {
  if (!element.gitRef || !element.repoPath) return [];

  if (!element.cachedFiles) {
    element.cachedFiles = await this.client.gitDiffTree(element.repoPath, element.gitRef);
  }

  return element.cachedFiles.map(
    (file) => new ChangedFileItem(file, element.repoPath!, element.gitRef!)
  );
}
```

- [ ] **Step 5: Update `getGroupChildren` to make review items expandable**

In the `getGroupChildren` method, update the review item construction. Change the `TreeItemCollapsibleState` from `None` to `Collapsed`, and store `gitRef` and `repoPath` on the item.

Find where the review `TreeItem` is created (the `const item = new ReviewTreeItem(` line inside the `.map()`) and change:

```typescript
const item = new ReviewTreeItem(
  `${sha} — ${subject}`,
  vscode.TreeItemCollapsibleState.Collapsed
);
```

After `item.jobId = job.id;`, add:

```typescript
item.gitRef = job.git_ref;
item.repoPath = job.repo_path;
```

- [ ] **Step 6: Update `getTreeItem` return type and class declaration**

Update the class `implements` to reflect the union type:

```typescript
export class ReviewTreeProvider
  implements vscode.TreeDataProvider<ReviewTreeItem | ChangedFileItem>
{
```

Update `_onDidChangeTreeData`:

```typescript
private _onDidChangeTreeData = new vscode.EventEmitter<
  ReviewTreeItem | ChangedFileItem | undefined | null | void
>();
readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
```

Update `getTreeItem`:

```typescript
getTreeItem(element: ReviewTreeItem | ChangedFileItem): vscode.TreeItem {
  return element;
}
```

- [ ] **Step 7: Handle empty SHA for added/deleted files in `GitContentProvider`**

Update `src/git-content-provider.ts` to handle the `empty` SHA sentinel:

```typescript
async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
  const params = new URLSearchParams(uri.query);
  const repo = params.get("repo");
  const sha = params.get("sha");
  const filePath = uri.path;

  if (!repo || !sha || !filePath || sha === "empty") {
    return "";
  }

  return this.client.gitShowFile(repo, sha, filePath);
}
```

- [ ] **Step 8: Build and verify**

Run: `cd /Users/cdolan/Projects/vscode-roborev && node esbuild.config.mjs`
Expected: Build succeeds with no errors.

- [ ] **Step 9: Manual test**

Open VS Code, trigger a review. Verify:
- Review items show a collapse arrow
- Expanding a review shows the changed files
- File icons reflect status (green added, red deleted, yellow modified)
- Clicking a file opens the VS Code diff editor with parent vs commit content
- Collapsing and re-expanding doesn't re-fetch (cached)

- [ ] **Step 10: Commit**

```bash
git add src/review-tree.ts src/git-content-provider.ts
git commit -m "feat: show changed files under each review with click-to-diff"
```

---

### Task 5: Webview Commit Details

**Files:**
- Modify: `src/review-webview.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Update `ReviewWebviewManager.show()` to accept commit details**

In `src/review-webview.ts`, update the `show` method signature and body. The method needs to receive commit details fetched by the caller.

Replace the `show` method:

```typescript
async show(jobId: number, commitDetails?: { message: string; diffstat: string }): Promise<void> {
  let review: ReviewShowResponse;
  try {
    review = await this.client.showReview(jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    vscode.window.showErrorMessage(`Failed to load review: ${msg}`);
    return;
  }

  if (this.panel) {
    this.panel.reveal(vscode.ViewColumn.One);
  } else {
    this.panel = vscode.window.createWebviewPanel(
      "roborevReview",
      "roborev",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: false }
    );
    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.onDidClose?.();
    });
    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "close" || msg.command === "reopen") {
        await this.onAction(msg.command, msg.jobId);
        await this.show(msg.jobId);
      }
      if (msg.command === "openTui") {
        vscode.commands.executeCommand("roborev.openTui");
      }
    });
  }

  const sha = review.job.git_ref.slice(0, 7);
  const subject = review.job.commit_subject;
  this.panel.title = `roborev: ${sha} — ${subject}`;
  this.panel.webview.html = this.buildHtml(review, commitDetails);
}
```

- [ ] **Step 2: Update `buildHtml` to render the commit details bottom pane**

Update the `buildHtml` signature and add the bottom pane. Add the `commitDetails` parameter:

```typescript
private buildHtml(
  review: ReviewShowResponse,
  commitDetails?: { message: string; diffstat: string }
): string {
```

Add CSS for the commit details section. Append these rules inside the existing `<style>` block, after the `.output h2` rule:

```css
.commit-details {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--vscode-widget-border);
}
.commit-details h3 {
  margin: 0 0 8px 0;
  font-size: 0.95em;
  color: var(--vscode-editor-foreground);
}
.commit-message {
  white-space: pre-wrap;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
  background: var(--vscode-textCodeBlock-background);
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 12px;
}
.diffstat {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
  color: var(--vscode-descriptionForeground);
  white-space: pre;
}
```

Build the commit details HTML. Add this after the `outputHtml` variable:

```typescript
const commitHtml = commitDetails
  ? `<div class="commit-details">
      <h3>Commit Details</h3>
      <div class="commit-message">${escapeHtml(commitDetails.message)}</div>
      ${commitDetails.diffstat ? `<div class="diffstat">${escapeHtml(commitDetails.diffstat)}</div>` : ""}
    </div>`
  : "";
```

In the returned HTML template, insert `${commitHtml}` after the output div:

```html
<div class="output">${outputHtml}</div>
${commitHtml}
```

- [ ] **Step 3: Add `escapeHtml` helper**

Add this function at the bottom of `src/review-webview.ts`, outside the class:

```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Update `extension.ts` to fetch and pass commit details**

In `src/extension.ts`, update the `roborev.showReview` command handler to fetch commit details before showing the webview.

Replace the command registration:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand("roborev.showReview", async (jobId: number) => {
    const review = await client.showReview(jobId).catch(() => null);
    let commitDetails: { message: string; diffstat: string } | undefined;
    if (review?.job.repo_path && review.job.git_ref) {
      commitDetails = await client.gitCommitDetails(review.job.repo_path, review.job.git_ref);
    }
    webviewManager.show(jobId, commitDetails);
  })
);
```

- [ ] **Step 5: Build and verify**

Run: `cd /Users/cdolan/Projects/vscode-roborev && node esbuild.config.mjs`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Manual test**

Open a review in the webview. Verify:
- Review output appears in the top section as before
- Commit details section appears below with a subtle border separator
- Full commit message body is rendered as preformatted text
- Diffstat shows file changes in monospace
- Action buttons (Close/Resolve, Open TUI) still work
- Reopening a different review updates both sections

- [ ] **Step 7: Commit**

```bash
git add src/review-webview.ts src/extension.ts
git commit -m "feat: show commit message and diffstat in webview detail panel"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Full build**

Run: `cd /Users/cdolan/Projects/vscode-roborev && node esbuild.config.mjs`
Expected: Clean build, no errors.

- [ ] **Step 2: End-to-end manual test**

Open VS Code with single-repo and multi-repo workspaces. Walk through:

1. Single repo shows the repo node with branch name
2. Multi repo still works as before (no regression)
3. Review items are expandable with changed files
4. Clicking a changed file opens the diff editor
5. Webview shows review on top, commit details on bottom
6. Close/Resolve and Reopen actions still work
7. Polling and badge updates still work
