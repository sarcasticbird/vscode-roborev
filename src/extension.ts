import * as vscode from "vscode";
import * as path from "node:path";
import { RoboRevClient } from "./roborev-client.js";
import { ReviewTreeProvider } from "./review-tree.js";
import { ReviewWebviewManager } from "./review-webview.js";

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("RoboRev");
  context.subscriptions.push(outputChannel);

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return;
  }

  const repoPaths = folders.map((f) => ({
    name: path.basename(f.uri.fsPath),
    path: f.uri.fsPath,
  }));

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

  pollTimer = setInterval(async () => {
    if (vscode.window.state.focused) {
      await treeProvider.refresh();
      updateBadge();
    }
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(pollTimer) });

  treeProvider.refresh().then(updateBadge);
}

export function deactivate(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
}
