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
