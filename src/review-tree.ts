import * as vscode from "vscode";
import type { RoboRevClient } from "./roborev-client.js";
import { type ReviewJob, type ReviewGroup, classifyReview, shortRef, isRangeRef } from "./types.js";

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

interface RepoData {
  name: string;
  path: string;
  branch: string | null;
  jobs: ReviewJob[];
}

export class ReviewTreeProvider
  implements vscode.TreeDataProvider<ReviewTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ReviewTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private repos: RepoData[] = [];
  private client: RoboRevClient;
  private repoPaths: { name: string; path: string }[];
  private available = true;
  private errorMessage: string | null = null;
  private _activeCount = 0;
  private _hasInProgress = false;

  get activeCount(): number {
    return this._activeCount;
  }

  get hasInProgress(): boolean {
    return this._hasInProgress;
  }

  constructor(client: RoboRevClient, repoPaths: { name: string; path: string }[]) {
    this.client = client;
    this.repoPaths = repoPaths;
  }

  updateRepoPaths(repoPaths: { name: string; path: string }[]): void {
    this.repoPaths = repoPaths;
  }

  async refresh(): Promise<void> {
    try {
      this.available = await this.client.isAvailable();
      if (!this.available) {
        this.errorMessage = "roborev CLI not found — install from github.com/roborev-dev/roborev";
        this.repos = [];
        this._activeCount = 0;
        this._onDidChangeTreeData.fire();
        return;
      }
      this.errorMessage = null;

      const results = await Promise.all(
        this.repoPaths.map(async (repo) => {
          const [jobs, branch] = await Promise.all([
            this.client.listReviews(repo.path, { limit: 50 }).catch(() => []),
            this.client.gitCurrentBranch(repo.path).catch(() => null),
          ]);
          return { name: repo.name, path: repo.path, branch, jobs };
        })
      );

      this.repos = results;
      this._activeCount = 0;
      this._hasInProgress = false;
      for (const repo of this.repos) {
        for (const job of repo.jobs) {
          const group = classifyReview(job);
          if (group === "inProgress") {
            this._hasInProgress = true;
            this._activeCount++;
          } else if (group === "needsAttention") {
            this._activeCount++;
          }
        }
      }
    } catch (err) {
      this.errorMessage =
        err instanceof Error ? err.message : "Failed to load reviews";
      this.repos = [];
      this._activeCount = 0;
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
    if (element.repoName && !element.group) {
      return this.getRepoGroups(element.repoName);
    }
    if (element.group) {
      const jobs = element.repoName
        ? this.getRepoJobs(element.repoName)
        : this.getAllJobs();
      return this.getGroupChildren(jobs, element.group);
    }
    return [];
  }

  private getAllJobs(): ReviewJob[] {
    return this.repos.flatMap((r) => r.jobs);
  }

  private getRepoJobs(repoName: string): ReviewJob[] {
    return this.repos.find((r) => r.name === repoName)?.jobs ?? [];
  }

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
      const counts: Record<ReviewGroup, number> = {
        inProgress: 0,
        needsAttention: 0,
        passed: 0,
        history: 0,
      };
      for (const job of repo.jobs) {
        counts[classifyReview(job)]++;
      }

      const prefix = repo.branch ? `${repo.branch} · ` : "";
      const parts: string[] = [];
      if (counts.needsAttention > 0) parts.push(`${counts.needsAttention} attn`);
      if (counts.passed > 0) parts.push(`${counts.passed} passed`);
      if (counts.inProgress > 0) parts.push(`${counts.inProgress} running`);
      if (counts.history > 0) parts.push(`${counts.history} history`);
      const status = parts.length > 0 ? parts.join(" · ") : "no reviews";

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

  private getRepoGroups(repoName: string): ReviewTreeItem[] {
    const jobs = this.getRepoJobs(repoName);
    return this.buildStatusGroups(jobs, repoName);
  }

  private buildStatusGroups(jobs: ReviewJob[], repoName?: string): ReviewTreeItem[] {
    const grouped = new Map<ReviewGroup, ReviewJob[]>();
    for (const group of GROUP_ORDER) {
      grouped.set(group, []);
    }
    for (const job of jobs) {
      const group = classifyReview(job);
      grouped.get(group)!.push(job);
    }

    return GROUP_ORDER.filter((g) => grouped.get(g)!.length > 0).map((g) => {
      const groupJobs = grouped.get(g)!;
      const item = new ReviewTreeItem(
        GROUP_LABELS[g],
        g === "history"
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded
      );
      item.iconPath = GROUP_ICONS[g];
      item.description = `(${groupJobs.length})`;
      item.group = g;
      item.repoName = repoName;
      return item;
    });
  }

  private getGroupChildren(jobs: ReviewJob[], group: ReviewGroup): ReviewTreeItem[] {
    return jobs
      .filter((j) => classifyReview(j) === group)
      .map((job) => {
        const ref = shortRef(job.git_ref);
        const subject = job.commit_subject
          ? job.commit_subject.length > 50
            ? job.commit_subject.slice(0, 47) + "..."
            : job.commit_subject
          : job.branch;

        const item = new ReviewTreeItem(
          `${ref} — ${subject}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.description = `${job.agent}  ${relativeTime(job.enqueued_at)}`;

        const tooltipLines = [`**Branch:** ${job.branch}`];
        if (isRangeRef(job.git_ref)) {
          tooltipLines.push(`**Range:** ${job.git_ref}`);
        } else {
          tooltipLines.push(`**Commit:** ${job.commit_subject}`);
        }
        tooltipLines.push(`**Type:** ${job.job_type} (${job.review_type})`);
        item.tooltip = new vscode.MarkdownString(tooltipLines.join("\n\n"));
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
  repoName?: string;
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
