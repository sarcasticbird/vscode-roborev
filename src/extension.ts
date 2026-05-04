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
