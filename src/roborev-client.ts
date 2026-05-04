import { execFile } from "node:child_process";
import * as vscode from "vscode";
import type { ReviewJob, ReviewShowResponse, ChangedFile } from "./types.js";

const HOMEBREW_PATHS = [
  "/opt/homebrew/bin/roborev",
  "/usr/local/bin/roborev",
];

export class RoboRevClient {
  private outputChannel: vscode.OutputChannel;
  private resolvedBinary: string | null = null;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async isAvailable(): Promise<boolean> {
    try {
      this.resolvedBinary = await this.findBinary();
      if (!this.resolvedBinary) {
        this.outputChannel.appendLine("binary resolution failed: roborev not found");
        this.outputChannel.appendLine(`process.env.PATH: ${process.env.PATH}`);
        return false;
      }
      await this.exec(["version"]);
      return true;
    } catch (err) {
      this.outputChannel.appendLine(`isAvailable error: ${err}`);
      return false;
    }
  }

  private async findBinary(): Promise<string | null> {
    if (this.resolvedBinary) {
      return this.resolvedBinary;
    }

    const shell = process.env.SHELL ?? "/bin/zsh";
    this.outputChannel.appendLine(`attempting shell resolve via: ${shell} -l -c "which roborev"`);
    try {
      const path = await this.shellResolve("roborev");
      if (path) {
        this.outputChannel.appendLine(`resolved roborev at: ${path}`);
        return path;
      }
      this.outputChannel.appendLine("shell resolve returned empty");
    } catch (err) {
      this.outputChannel.appendLine(`shell resolve failed: ${err}`);
    }

    const { accessSync, constants } = await import("node:fs");
    for (const candidate of HOMEBREW_PATHS) {
      this.outputChannel.appendLine(`checking: ${candidate}`);
      try {
        accessSync(candidate, constants.X_OK);
        this.outputChannel.appendLine(`found roborev at: ${candidate}`);
        return candidate;
      } catch (err) {
        this.outputChannel.appendLine(`  not found: ${err}`);
        continue;
      }
    }

    return null;
  }

  private shellResolve(binary: string): Promise<string | null> {
    return new Promise((resolve) => {
      const shell = process.env.SHELL ?? "/bin/zsh";
      execFile(shell, ["-l", "-c", `which ${binary}`], { timeout: 5_000 }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const path = stdout.trim();
        resolve(path || null);
      });
    });
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
    return JSON.parse(output) as ReviewJob[] ?? [];
  }

  gitCurrentBranch(repoPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      execFile("git", ["-C", repoPath, "branch", "--show-current"], { timeout: 5_000 }, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout.trim() || null);
      });
    });
  }

  gitDiffTree(repoPath: string, sha: string): Promise<ChangedFile[]> {
    return new Promise((resolve) => {
      execFile(
        "git",
        ["-C", repoPath, "diff-tree", "--no-commit-id", "-r", "--name-status", sha],
        { timeout: 5_000 },
        (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          const files: ChangedFile[] = [];
          for (const line of stdout.trim().split("\n")) {
            if (!line) continue;
            const [status, ...pathParts] = line.split("\t");
            if (!status || pathParts.length === 0) continue;
            const statusChar = status.charAt(0) as ChangedFile["status"];
            if (statusChar === "R" || statusChar === "C") {
              files.push({
                status: statusChar,
                path: pathParts[pathParts.length - 1],
                oldPath: pathParts[0],
              });
            } else {
              files.push({
                status: statusChar,
                path: pathParts[0],
              });
            }
          }
          resolve(files);
        }
      );
    });
  }

  gitShowFile(repoPath: string, sha: string, filePath: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        "git",
        ["-C", repoPath, "show", `${sha}:${filePath}`],
        { timeout: 5_000, maxBuffer: 5 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            resolve("");
            return;
          }
          resolve(stdout);
        }
      );
    });
  }

  gitCommitDetails(repoPath: string, sha: string): Promise<{ message: string; diffstat: string }> {
    return new Promise((resolve) => {
      execFile(
        "git",
        ["-C", repoPath, "show", "--stat", "--format=%B%x00", sha],
        { timeout: 5_000 },
        (error, stdout) => {
          if (error) {
            resolve({ message: "", diffstat: "" });
            return;
          }
          const nulIdx = stdout.indexOf("\0");
          if (nulIdx === -1) {
            resolve({ message: stdout.trim(), diffstat: "" });
            return;
          }
          const message = stdout.slice(0, nulIdx).trim();
          const diffstat = stdout.slice(nulIdx + 1).trim();
          resolve({ message, diffstat });
        }
      );
    });
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
      const binary = this.resolvedBinary ?? "roborev";
      const timeout = args[0] === "close" ? 10_000 : 5_000;
      this.outputChannel.appendLine(`${binary} ${args.join(" ")}`);

      execFile(binary, args, { timeout }, (error, stdout, stderr) => {
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
