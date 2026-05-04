# vscode-roborev Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that surfaces RoboRev code review findings in a sidebar tree view with a webview detail panel, close/resolve actions, and TUI shortcut.

**Architecture:** Native TreeView sidebar grouped by review status (In Progress, Needs Attention, Passed, History). Clicking a review opens a Webview panel rendering the finding markdown. All data fetched via `roborev` CLI JSON output. Close/resolve via `roborev close` command.

**Tech Stack:** TypeScript (strict), VS Code Extension API (1.85+), esbuild bundler, marked (markdown→HTML), Flox for dev environment.

---

## File Structure

```
vscode-roborev/
├── src/
│   ├── extension.ts          — entry point: activate/deactivate, register commands, wire components
│   ├── types.ts              — interfaces matching roborev CLI JSON output
│   ├── roborev-client.ts     — CLI wrapper: spawn roborev, parse JSON, detect availability
│   ├── review-tree.ts        — TreeDataProvider: groups, tree items, refresh logic
│   └── review-webview.ts     — Webview panel: render markdown, handle close/reopen/tui messages
├── media/
│   └── roborev-icon.svg      — activity bar icon (simple robot/review glyph)
├── package.json              — extension manifest (contributes, activationEvents, commands, views)
├── tsconfig.json             — strict mode, ES2022 target, bundler module resolution
├── esbuild.config.mjs        — single-file bundle for extension host
└── .vscodeignore             — exclude src/, docs/, node_modules/ from packaged extension
```

---

### Task 1: Project Scaffolding

Set up the build toolchain, flox environment, extension manifest, and verify it loads in VS Code.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `.vscodeignore`
- Create: `.gitignore`
- Create: `src/extension.ts`
- Modify: `.flox/env/manifest.toml`

- [ ] **Step 1: Configure flox environment**

Edit `.flox/env/manifest.toml` to add nodejs:

```toml
[install]
nodejs.pkg-path = "nodejs_22"
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "vscode-roborev",
  "displayName": "RoboRev",
  "description": "RoboRev code review findings in VS Code",
  "version": "0.1.0",
  "publisher": "sarcasticbird",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "workspaceContains:.roborev-id"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "roborev",
          "title": "RoboRev",
          "icon": "media/roborev-icon.svg"
        }
      ]
    },
    "views": {
      "roborev": [
        {
          "id": "roborevReviews",
          "name": "Reviews"
        }
      ]
    },
    "commands": [
      {
        "command": "roborev.refresh",
        "title": "RoboRev: Refresh Reviews",
        "icon": "$(refresh)"
      },
      {
        "command": "roborev.close",
        "title": "RoboRev: Close Review"
      },
      {
        "command": "roborev.reopen",
        "title": "RoboRev: Reopen Review"
      },
      {
        "command": "roborev.openTui",
        "title": "RoboRev: Open TUI"
      },
      {
        "command": "roborev.showReview",
        "title": "RoboRev: Show Review"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "roborev.refresh",
          "when": "view == roborevReviews",
          "group": "navigation"
        }
      ],
      "view/item/context": [
        {
          "command": "roborev.close",
          "when": "view == roborevReviews && viewItem == reviewOpen"
        },
        {
          "command": "roborev.reopen",
          "when": "view == roborevReviews && viewItem == reviewClosed"
        },
        {
          "command": "roborev.openTui",
          "when": "view == roborevReviews && viewItem =~ /^review/"
        }
      ]
    }
  },
  "scripts": {
    "build": "node esbuild.config.mjs",
    "watch": "node esbuild.config.mjs --watch",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.7.0"
  },
  "dependencies": {
    "marked": "^15.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create esbuild.config.mjs**

```javascript
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
});

if (watch) {
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
```

- [ ] **Step 5: Create .vscodeignore**

```
src/**
docs/**
node_modules/**
.flox/**
.git/**
tsconfig.json
esbuild.config.mjs
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
*.vsix
```

- [ ] **Step 7: Create minimal extension entry point**

Create `src/extension.ts`:

```typescript
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("RoboRev");
  outputChannel.appendLine("RoboRev extension activated");
  context.subscriptions.push(outputChannel);
}

export function deactivate(): void {}
```

- [ ] **Step 8: Create activity bar icon**

Create `media/roborev-icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
  <path d="M2 17l10 5 10-5"/>
  <path d="M2 12l10 5 10-5"/>
  <circle cx="12" cy="12" r="2" fill="currentColor"/>
</svg>
```

- [ ] **Step 9: Install dependencies and build**

Run:
```bash
flox activate -c 'npm install && npm run build'
```

Expected: `dist/extension.js` is created with no errors.

- [ ] **Step 10: Test extension loads in VS Code**

Press F5 to launch Extension Development Host (or run from command line). Open a workspace that has a `.roborev-id` file. Verify:
- RoboRev icon appears in the activity bar
- "RoboRev extension activated" appears in the Output panel under "RoboRev"

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json esbuild.config.mjs .vscodeignore .gitignore src/extension.ts media/roborev-icon.svg .flox/env/manifest.toml
git commit -m "feat: scaffold vscode-roborev extension with build toolchain"
```

---

### Task 2: Types and CLI Client

Define TypeScript interfaces matching the actual `roborev` CLI JSON output, then build the client wrapper.

**Files:**
- Create: `src/types.ts`
- Create: `src/roborev-client.ts`

- [ ] **Step 1: Create types.ts**

These interfaces match the actual JSON output from `roborev list --json` and `roborev show --json`:

```typescript
export interface ReviewJob {
  id: number;
  repo_id: number;
  commit_id: number;
  git_ref: string;
  branch: string;
  session_id: string;
  agent: string;
  reasoning: string;
  job_type: string;
  status: "queued" | "running" | "done" | "failed" | "canceled" | "skipped";
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  worker_id: string;
  retry_count: number;
  agentic: boolean;
  prompt_prebuilt: boolean;
  review_type: string;
  patch_id: string;
  command_line: string;
  uuid: string;
  source_machine_id: string;
  repo_path: string;
  repo_name: string;
  commit_subject: string;
  closed: boolean;
  verdict: string;
}

export interface ReviewShowResponse {
  id: number;
  job_id: number;
  agent: string;
  prompt: string;
  output: string;
  created_at: string;
  closed: boolean;
  uuid: string;
  verdict_bool: number | null;
  job: ReviewShowJob;
}

export interface ReviewShowJob {
  id: number;
  repo_id: number;
  commit_id: number;
  git_ref: string;
  branch: string;
  session_id: string;
  agent: string;
  reasoning: string;
  job_type: string;
  status: string;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  worker_id: string;
  retry_count: number;
  agentic: boolean;
  prompt_prebuilt: boolean;
  review_type: string;
  patch_id: string;
  repo_path: string;
  repo_name: string;
  commit_subject: string;
  verdict: string;
}

export type ReviewGroup = "inProgress" | "needsAttention" | "passed" | "history";

export function classifyReview(job: ReviewJob): ReviewGroup {
  if (job.status === "queued" || job.status === "running") {
    return "inProgress";
  }
  if (
    (job.status === "done" && job.verdict === "F" && !job.closed) ||
    job.status === "failed"
  ) {
    return "needsAttention";
  }
  if (
    job.status === "done" &&
    (job.verdict === "P" || job.closed)
  ) {
    return "passed";
  }
  return "history";
}
```

- [ ] **Step 2: Create roborev-client.ts**

```typescript
import { execFile } from "node:child_process";
import * as vscode from "vscode";
import type { ReviewJob, ReviewShowResponse } from "./types.js";

export class RoboRevClient {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.exec(["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  async listReviews(
    repoPath: string,
    options?: {
      status?: string;
      open?: boolean;
      closed?: boolean;
      branch?: string;
      limit?: number;
    }
  ): Promise<ReviewJob[]> {
    const args = ["list", "--json", "--repo", repoPath];
    if (options?.status) {
      args.push("--status", options.status);
    }
    if (options?.open) {
      args.push("--open");
    }
    if (options?.closed) {
      args.push("--closed");
    }
    if (options?.branch) {
      args.push("--branch", options.branch);
    }
    args.push("--limit", String(options?.limit ?? 50));

    const output = await this.exec(args);
    return JSON.parse(output) as ReviewJob[];
  }

  async showReview(jobId: number): Promise<ReviewShowResponse> {
    const output = await this.exec(["show", "--json", "--job", String(jobId)]);
    return JSON.parse(output) as ReviewShowResponse;
  }

  async closeReview(jobId: number): Promise<void> {
    await this.exec(["close", String(jobId)]);
  }

  async reopenReview(jobId: number): Promise<void> {
    await this.exec(["close", "--reopen", String(jobId)]);
  }

  private exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = args[0] === "close" ? 10_000 : 5_000;
      this.outputChannel.appendLine(`roborev ${args.join(" ")}`);

      execFile("roborev", args, { timeout }, (error, stdout, stderr) => {
        if (error) {
          this.outputChannel.appendLine(`error: ${error.message}`);
          if (stderr) {
            this.outputChannel.appendLine(`stderr: ${stderr}`);
          }
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
flox activate -c 'npm run build'
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/roborev-client.ts
git commit -m "feat: add types and CLI client wrapper for roborev"
```

---

### Task 3: Review Tree Provider

Build the TreeDataProvider that organizes reviews into status groups.

**Files:**
- Create: `src/review-tree.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Create review-tree.ts**

```typescript
import * as vscode from "vscode";
import type { RoboRevClient } from "./roborev-client.js";
import { type ReviewJob, type ReviewGroup, classifyReview } from "./types.js";

const GROUP_LABELS: Record<ReviewGroup, string> = {
  inProgress: "In Progress",
  needsAttention: "Needs Attention",
  passed: "Passed",
  history: "History",
};

const GROUP_ICONS: Record<ReviewGroup, vscode.ThemeIcon> = {
  inProgress: new vscode.ThemeIcon("sync~spin"),
  needsAttention: new vscode.ThemeIcon("error", new vscode.ThemeColor("errorForeground")),
  passed: new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed")),
  history: new vscode.ThemeIcon("history"),
};

const GROUP_ORDER: ReviewGroup[] = [
  "inProgress",
  "needsAttention",
  "passed",
  "history",
];

export class ReviewTreeProvider
  implements vscode.TreeDataProvider<ReviewTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ReviewTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private jobs: ReviewJob[] = [];
  private client: RoboRevClient;
  private repoPath: string;
  private available = true;
  private errorMessage: string | null = null;

  constructor(client: RoboRevClient, repoPath: string) {
    this.client = client;
    this.repoPath = repoPath;
  }

  async refresh(): Promise<void> {
    try {
      this.available = await this.client.isAvailable();
      if (!this.available) {
        this.errorMessage = "RoboRev CLI not found";
        this.jobs = [];
        this._onDidChangeTreeData.fire();
        return;
      }
      this.errorMessage = null;
      this.jobs = await this.client.listReviews(this.repoPath);
    } catch (err) {
      this.errorMessage =
        err instanceof Error ? err.message : "Failed to load reviews";
      this.jobs = [];
    }
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewTreeItem): ReviewTreeItem[] {
    if (!element) {
      return this.getRootItems();
    }
    if (element.group) {
      return this.getGroupChildren(element.group);
    }
    return [];
  }

  private getRootItems(): ReviewTreeItem[] {
    if (!this.available) {
      const item = new ReviewTreeItem(
        this.errorMessage ?? "RoboRev CLI not found",
        vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }

    if (this.errorMessage) {
      const item = new ReviewTreeItem(
        this.errorMessage,
        vscode.TreeItemCollapsibleState.None
      );
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }

    if (this.jobs.length === 0) {
      const item = new ReviewTreeItem(
        "No reviews found",
        vscode.TreeItemCollapsibleState.None
      );
      item.description = "Reviews appear after commits";
      return [item];
    }

    const grouped = new Map<ReviewGroup, ReviewJob[]>();
    for (const group of GROUP_ORDER) {
      grouped.set(group, []);
    }
    for (const job of this.jobs) {
      const group = classifyReview(job);
      grouped.get(group)!.push(job);
    }

    return GROUP_ORDER.filter((g) => grouped.get(g)!.length > 0).map((g) => {
      const jobs = grouped.get(g)!;
      const item = new ReviewTreeItem(
        GROUP_LABELS[g],
        g === "history"
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded
      );
      item.iconPath = GROUP_ICONS[g];
      item.description = `(${jobs.length})`;
      item.group = g;
      return item;
    });
  }

  private getGroupChildren(group: ReviewGroup): ReviewTreeItem[] {
    return this.jobs
      .filter((j) => classifyReview(j) === group)
      .map((job) => {
        const sha = job.git_ref.slice(0, 7);
        const subject =
          job.commit_subject.length > 50
            ? job.commit_subject.slice(0, 47) + "..."
            : job.commit_subject;

        const item = new ReviewTreeItem(
          `${sha} — ${subject}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.description = `${job.agent}  ${relativeTime(job.enqueued_at)}`;
        item.tooltip = new vscode.MarkdownString(
          `**Branch:** ${job.branch}\n\n` +
            `**Commit:** ${job.commit_subject}\n\n` +
            `**Type:** ${job.job_type} (${job.review_type})`
        );
        item.jobId = job.id;

        item.contextValue = job.closed ? "reviewClosed" : "reviewOpen";

        if (job.status === "queued" || job.status === "running") {
          item.iconPath = new vscode.ThemeIcon("sync~spin");
          item.contextValue = "reviewInProgress";
        } else if (job.status === "failed") {
          item.iconPath = new vscode.ThemeIcon(
            "warning",
            new vscode.ThemeColor("errorForeground")
          );
        } else if (job.verdict === "F" && !job.closed) {
          item.iconPath = new vscode.ThemeIcon(
            "circle-filled",
            new vscode.ThemeColor("errorForeground")
          );
        } else {
          item.iconPath = new vscode.ThemeIcon(
            "check",
            new vscode.ThemeColor("testing.iconPassed")
          );
        }

        item.command = {
          command: "roborev.showReview",
          title: "Show Review",
          arguments: [job.id],
        };

        return item;
      });
  }
}

export class ReviewTreeItem extends vscode.TreeItem {
  group?: ReviewGroup;
  jobId?: number;
}

function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
```

- [ ] **Step 2: Wire tree provider into extension.ts**

Replace `src/extension.ts` with:

```typescript
import * as vscode from "vscode";
import { RoboRevClient } from "./roborev-client.js";
import { ReviewTreeProvider } from "./review-tree.js";

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("RoboRev");
  context.subscriptions.push(outputChannel);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const client = new RoboRevClient(outputChannel);
  const treeProvider = new ReviewTreeProvider(client, workspaceRoot);

  const treeView = vscode.window.createTreeView("roborevReviews", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand("roborev.refresh", () => {
      treeProvider.refresh();
    })
  );

  // Refresh on window focus
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        treeProvider.refresh();
      }
    })
  );

  // Poll every 60 seconds while focused
  pollTimer = setInterval(() => {
    if (vscode.window.state.focused) {
      treeProvider.refresh();
    }
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });

  // Initial load
  treeProvider.refresh();
}

export function deactivate(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
}
```

- [ ] **Step 3: Build and verify**

Run:
```bash
flox activate -c 'npm run build'
```

Expected: Build succeeds.

- [ ] **Step 4: Manual test**

Press F5 to launch Extension Development Host. Open a workspace with `.roborev-id`. Verify:
- RoboRev activity bar icon shows
- Sidebar tree shows review groups (In Progress, Needs Attention, Passed)
- Reviews appear under the correct groups with SHA, subject, agent, time
- Clicking refresh button reloads the tree
- Empty groups are hidden

- [ ] **Step 5: Commit**

```bash
git add src/review-tree.ts src/extension.ts
git commit -m "feat: add review tree sidebar with status grouping"
```

---

### Task 4: Review Detail Webview

Build the webview panel that renders review findings as markdown when a tree item is clicked.

**Files:**
- Create: `src/review-webview.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Create review-webview.ts**

```typescript
import * as vscode from "vscode";
import { marked } from "marked";
import type { RoboRevClient } from "./roborev-client.js";
import type { ReviewShowResponse } from "./types.js";

export class ReviewWebviewManager {
  private panel: vscode.WebviewPanel | undefined;
  private client: RoboRevClient;
  private outputChannel: vscode.OutputChannel;
  private onDidClose: (() => void) | undefined;

  constructor(
    client: RoboRevClient,
    outputChannel: vscode.OutputChannel,
    private readonly onAction: (action: string, jobId: number) => Promise<void>
  ) {
    this.client = client;
    this.outputChannel = outputChannel;
  }

  async show(jobId: number): Promise<void> {
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
        "RoboRev",
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
    this.panel.title = `RoboRev: ${sha} — ${subject}`;
    this.panel.webview.html = this.buildHtml(review);
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private buildHtml(review: ReviewShowResponse): string {
    const job = review.job;
    const sha = job.git_ref.slice(0, 7);
    const fullSha = job.git_ref;
    const verdictLabel = review.closed
      ? "Resolved"
      : review.verdict_bool === 1
        ? "Pass"
        : review.verdict_bool === 0
          ? "Fail"
          : "Pending";
    const verdictClass = review.closed
      ? "resolved"
      : review.verdict_bool === 0
        ? "fail"
        : "pass";

    const actionButton = review.closed
      ? `<button class="btn btn-secondary" onclick="postMessage({ command: 'reopen', jobId: ${review.job_id} })">Reopen</button>`
      : `<button class="btn btn-primary" onclick="postMessage({ command: 'close', jobId: ${review.job_id} })">Close / Resolve</button>`;

    const outputHtml = marked.parse(review.output || "No output available.", {
      async: false,
    }) as string;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      line-height: 1.6;
    }
    .header {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    .header-field {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .header-field strong {
      color: var(--vscode-editor-foreground);
    }
    .verdict {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: bold;
    }
    .verdict.fail {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-errorForeground);
    }
    .verdict.pass {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-testing-iconPassed);
    }
    .verdict.resolved {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .btn {
      padding: 4px 12px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .output {
      margin-top: 8px;
    }
    .output pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
    }
    .output code {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }
    .output h2 {
      border-bottom: 1px solid var(--vscode-widget-border);
      padding-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="verdict ${verdictClass}">${verdictLabel}</span>
    <span class="header-field"><strong>SHA:</strong> ${fullSha.slice(0, 12)}</span>
    <span class="header-field"><strong>Branch:</strong> ${job.branch}</span>
    <span class="header-field"><strong>Agent:</strong> ${job.agent}</span>
    <span class="header-field"><strong>Time:</strong> ${job.finished_at ?? job.enqueued_at}</span>
  </div>
  <div class="actions">
    ${actionButton}
    <button class="btn btn-secondary" onclick="postMessage({ command: 'openTui' })">Open TUI</button>
  </div>
  <div class="output">${outputHtml}</div>
  <script>
    const vscode = acquireVsCodeApi();
    function postMessage(msg) {
      vscode.postMessage(msg);
    }
  </script>
</body>
</html>`;
  }
}
```

- [ ] **Step 2: Wire webview into extension.ts**

Add imports and webview registration to `src/extension.ts`. Replace the file with:

```typescript
import * as vscode from "vscode";
import { RoboRevClient } from "./roborev-client.js";
import { ReviewTreeProvider } from "./review-tree.js";
import { ReviewWebviewManager } from "./review-webview.js";

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("RoboRev");
  context.subscriptions.push(outputChannel);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const client = new RoboRevClient(outputChannel);
  const treeProvider = new ReviewTreeProvider(client, workspaceRoot);

  const treeView = vscode.window.createTreeView("roborevReviews", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const webviewManager = new ReviewWebviewManager(
    client,
    outputChannel,
    async (action, jobId) => {
      if (action === "close") {
        await client.closeReview(jobId);
      } else if (action === "reopen") {
        await client.reopenReview(jobId);
      }
      treeProvider.refresh();
    }
  );
  context.subscriptions.push({ dispose: () => webviewManager.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand("roborev.refresh", () => {
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("roborev.showReview", (jobId: number) => {
      webviewManager.show(jobId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "roborev.close",
      async (item: { jobId?: number }) => {
        if (item.jobId) {
          await client.closeReview(item.jobId);
          treeProvider.refresh();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "roborev.reopen",
      async (item: { jobId?: number }) => {
        if (item.jobId) {
          await client.reopenReview(item.jobId);
          treeProvider.refresh();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("roborev.openTui", () => {
      const existingTerminal = vscode.window.terminals.find(
        (t) => t.name === "RoboRev TUI"
      );
      if (existingTerminal) {
        existingTerminal.show();
        return;
      }
      const terminal = vscode.window.createTerminal({
        name: "RoboRev TUI",
        cwd: workspaceRoot,
      });
      terminal.sendText("roborev tui");
      terminal.show();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        treeProvider.refresh();
      }
    })
  );

  pollTimer = setInterval(() => {
    if (vscode.window.state.focused) {
      treeProvider.refresh();
    }
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });

  treeProvider.refresh();
}

export function deactivate(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
}
```

- [ ] **Step 3: Build and verify**

Run:
```bash
flox activate -c 'npm run build'
```

Expected: Build succeeds.

- [ ] **Step 4: Manual test**

Press F5. Open a workspace with roborev reviews. Verify:
- Click a review in the tree → webview opens with findings markdown
- Verdict badge shows correct state (Pass/Fail/Resolved)
- "Close / Resolve" button closes the finding, refreshes tree, updates webview to "Resolved"
- "Reopen" button appears on resolved reviews and works
- "Open TUI" button opens integrated terminal with `roborev tui`
- Clicking different reviews reuses the same webview panel

- [ ] **Step 5: Commit**

```bash
git add src/review-webview.ts src/extension.ts
git commit -m "feat: add webview detail panel with close/reopen and TUI shortcut"
```

---

### Task 5: Polish and Error States

Handle edge cases: roborev not installed, daemon not running, empty repos. Add welcome view and dev tooling.

**Files:**
- Modify: `src/review-tree.ts`
- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] **Step 1: Improve error messaging in the tree provider**

In `src/review-tree.ts`, update the `refresh` method to improve the error message when the CLI is not found:

```typescript
async refresh(): Promise<void> {
  try {
    this.available = await this.client.isAvailable();
    if (!this.available) {
      this.errorMessage = "RoboRev CLI not found — install from github.com/roborev-dev/roborev";
      this.jobs = [];
      this._onDidChangeTreeData.fire();
      return;
    }
    this.errorMessage = null;
    this.jobs = await this.client.listReviews(this.repoPath, { limit: 50 });
  } catch (err) {
    this.errorMessage =
      err instanceof Error ? err.message : "Failed to load reviews";
    this.jobs = [];
  }
  this._onDidChangeTreeData.fire();
}
```

- [ ] **Step 2: Add welcome view for non-roborev workspaces**

In `package.json`, add a `viewsWelcome` section inside `contributes`:

```json
"viewsWelcome": [
  {
    "view": "roborevReviews",
    "contents": "No RoboRev reviews found.\n\nRun `roborev init` in your project to enable automatic code reviews.\n\n[Open Terminal](command:workbench.action.terminal.new)"
  }
]
```

- [ ] **Step 3: Add a launch.json for easier development**

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

Create `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "watch",
      "isBackground": true,
      "problemMatcher": "$esbuild-watch",
      "label": "npm: watch",
      "group": {
        "kind": "build",
        "isDefault": true
      }
    }
  ]
}
```

- [ ] **Step 4: Build and full manual test**

Run:
```bash
flox activate -c 'npm run build'
```

Press F5 and test:
- Open a workspace with roborev reviews → tree populates correctly
- Open a workspace without `.roborev-id` → welcome message shown
- Close and reopen reviews from context menu
- Open TUI from context menu
- Refresh button works
- Switching between VS Code windows triggers auto-refresh

- [ ] **Step 5: Commit**

```bash
git add src/review-tree.ts src/extension.ts package.json .vscode/launch.json .vscode/tasks.json
git commit -m "feat: add error states, welcome view, history, and dev tooling"
```

---

### Task 6: Final Build Verification

Ensure the extension packages cleanly and works end-to-end.

**Files:**
- No new files

- [ ] **Step 1: Clean build**

```bash
flox activate -c 'rm -rf dist node_modules && npm install && npm run build'
```

Expected: Build succeeds, `dist/extension.js` exists.

- [ ] **Step 2: Package the extension**

```bash
flox activate -c 'npx vsce package --allow-missing-repository'
```

Expected: `vscode-roborev-0.1.0.vsix` is created.

- [ ] **Step 3: Install and test the packaged extension**

```bash
code --install-extension vscode-roborev-0.1.0.vsix
```

Open a roborev-enabled workspace. Verify:
- Activity bar icon appears
- Tree loads with reviews
- Click review → webview opens with markdown findings
- Close/Reopen works
- Open TUI works
- Refresh works

- [ ] **Step 4: Commit any final adjustments**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: final adjustments from end-to-end testing"
```
