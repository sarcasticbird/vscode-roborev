import * as vscode from "vscode";
import { marked } from "marked";
import type { RoboRevClient } from "./roborev-client.js";
import type { ReviewShowResponse, ChangedFile } from "./types.js";
import { buildGitUri } from "./git-content-provider.js";

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

    let commitDetails: { message: string; diffstat: string } | undefined;
    let changedFiles: ChangedFile[] = [];
    if (review.job.repo_path && review.job.git_ref) {
      try {
        [commitDetails, changedFiles] = await Promise.all([
          this.client.gitCommitDetails(review.job.repo_path, review.job.git_ref),
          this.client.gitDiffTree(review.job.repo_path, review.job.git_ref),
        ]);
      } catch (e) {
        this.outputChannel.appendLine(`Failed to fetch commit details: ${e}`);
      }
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
        if (msg.command === "openDiff") {
          const { repoPath, sha, filePath, oldPath, status } = msg;
          const parentSha = `${sha}~1`;
          const leftPath = oldPath ?? filePath;
          const leftUri = status === "A"
            ? buildGitUri(repoPath, "empty", filePath)
            : buildGitUri(repoPath, parentSha, leftPath);
          const rightUri = status === "D"
            ? buildGitUri(repoPath, "empty", filePath)
            : buildGitUri(repoPath, sha, filePath);
          const basename = filePath.split("/").pop() ?? filePath;
          vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, `${basename} (${sha.slice(0, 7)})`);
        }
      });
    }

    const sha = review.job.git_ref.slice(0, 7);
    const subject = review.job.commit_subject;
    this.panel.title = `roborev: ${sha} — ${subject}`;
    this.panel.webview.html = this.buildHtml(review, commitDetails, changedFiles);
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private buildHtml(
    review: ReviewShowResponse,
    commitDetails?: { message: string; diffstat: string },
    changedFiles: ChangedFile[] = []
  ): string {
    const job = review.job;
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

    const repoPath = review.job.repo_path;
    const gitRef = review.job.git_ref;

    const fileListHtml = changedFiles.length > 0
      ? `<div class="file-list">
        <h4>Files changed (${changedFiles.length})</h4>
        ${changedFiles.map((f) => {
          const data = escapeHtml(JSON.stringify({
            command: "openDiff",
            repoPath,
            sha: gitRef,
            filePath: f.path,
            oldPath: f.oldPath,
            status: f.status,
          }));
          return `<a class="file-link" href="#" onclick="postMessage(JSON.parse(this.dataset.msg)); return false" data-msg="${data}">
            <span class="file-status file-status-${f.status}">${f.status}</span>
            <span class="file-path">${escapeHtml(f.path)}</span>
          </a>`;
        }).join("\n")}
      </div>`
      : "";

    const commitHtml = commitDetails || fileListHtml
      ? `<div class="commit-details">
      <h3>Commit Details</h3>
      ${commitDetails ? `<div class="commit-message">${escapeHtml(commitDetails.message)}</div>` : ""}
      ${fileListHtml}
    </div>`
      : "";

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
    .file-list h4 {
      margin: 0 0 4px 0;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .file-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 4px;
      text-decoration: none;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      border-radius: 3px;
      cursor: pointer;
    }
    .file-link:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .file-status {
      font-weight: bold;
      font-size: 0.8em;
      width: 1.2em;
      text-align: center;
    }
    .file-status-A { color: var(--vscode-gitDecoration-addedResourceForeground); }
    .file-status-D { color: var(--vscode-gitDecoration-deletedResourceForeground); }
    .file-status-M { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
    .file-status-R { color: var(--vscode-gitDecoration-renamedResourceForeground); }
    .file-status-C { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
    .file-path {
      color: var(--vscode-textLink-foreground);
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
  ${commitHtml}
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
