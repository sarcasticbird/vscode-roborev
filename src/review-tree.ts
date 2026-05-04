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
