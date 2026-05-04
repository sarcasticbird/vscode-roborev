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

    if (!repo || !sha || !filePath || sha === "empty") {
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
