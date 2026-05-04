import { execFile } from "node:child_process";
import * as vscode from "vscode";
import type { ReviewJob, ReviewShowResponse } from "./types.js";

export class RoboRevClient {
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.exec(["--version"]);
      return true;
    } catch {
      return false;
    }
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
    return JSON.parse(output) as ReviewJob[];
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
      const timeout = args[0] === "close" ? 10_000 : 5_000;
      this.outputChannel.appendLine(`roborev ${args.join(" ")}`);

      execFile("roborev", args, { timeout }, (error, stdout, stderr) => {
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
