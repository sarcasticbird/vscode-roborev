import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("RoboRev");
  outputChannel.appendLine("RoboRev extension activated");
  context.subscriptions.push(outputChannel);
}

export function deactivate(): void {}
