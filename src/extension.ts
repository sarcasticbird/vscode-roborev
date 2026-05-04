import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { RoboRevClient } from "./roborev-client.js";
import { ReviewTreeProvider } from "./review-tree.js";
import { ReviewWebviewManager } from "./review-webview.js";

let pollTimer: ReturnType<typeof setInterval> | undefined;

function discoverRepos(
  folders: readonly vscode.WorkspaceFolder[],
  outputChannel: vscode.OutputChannel
): { name: string; path: string }[] {
  const repos: { name: string; path: string }[] = [];

  for (const folder of folders) {
    const root = folder.uri.fsPath;

    if (isGitRepo(root)) {
      repos.push({ name: path.basename(root), path: root });
    }

    // Always scan one level deep for child git repos
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
          continue;
        }
        const childPath = path.join(root, entry.name);
        if (isGitRepo(childPath)) {
          repos.push({ name: entry.name, path: childPath });
        }
      }
    } catch {
      continue;
    }
  }

  outputChannel.appendLine(`discovered ${repos.length} repo(s): ${repos.map((r) => r.name).join(", ")}`);
  return repos;
}

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("RoboRev");
  context.subscriptions.push(outputChannel);

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return;
  }

  const repoPaths = discoverRepos(folders, outputChannel);

  const client = new RoboRevClient(outputChannel);
  const treeProvider = new ReviewTreeProvider(client, repoPaths);

  const treeView = vscode.window.createTreeView("roborevReviews", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const updateBadge = () => {
    const count = treeProvider.activeCount;
    treeView.badge = count > 0
      ? { value: count, tooltip: `${count} review${count === 1 ? "" : "s"} need attention` }
      : undefined;
  };

  const webviewManager = new ReviewWebviewManager(
    client,
    outputChannel,
    async (action, jobId) => {
      if (action === "close") {
        await client.closeReview(jobId);
      } else if (action === "reopen") {
        await client.reopenReview(jobId);
      }
      await treeProvider.refresh();
      updateBadge();
    }
  );
  context.subscriptions.push({ dispose: () => webviewManager.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand("roborev.refresh", async () => {
      await treeProvider.refresh();
      updateBadge();
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
          await treeProvider.refresh();
          updateBadge();
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
          await treeProvider.refresh();
          updateBadge();
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
        cwd: folders[0].uri.fsPath,
      });
      terminal.sendText("roborev tui");
      terminal.show();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (state) => {
      if (state.focused) {
        await treeProvider.refresh();
        updateBadge();
      }
    })
  );

  const POLL_FAST = 5_000;
  const POLL_IDLE = 60_000;
  let pollDisposed = false;

  const schedulePoll = () => {
    if (pollDisposed) return;
    pollTimer = setTimeout(async () => {
      try {
        if (vscode.window.state.focused) {
          await treeProvider.refresh();
          updateBadge();
        }
      } finally {
        schedulePoll();
      }
    }, treeProvider.hasInProgress ? POLL_FAST : POLL_IDLE);
  };
  schedulePoll();
  context.subscriptions.push({ dispose: () => { pollDisposed = true; clearTimeout(pollTimer); } });

  treeProvider.refresh().then(updateBadge);
}

export function deactivate(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
  }
}
