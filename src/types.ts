export interface ReviewJob {
  id: number;
  repo_id: number;
  commit_id: number;
  git_ref: string;
  branch: string;
  session_id: string;
  agent: string;
  reasoning: string;
  job_type: string;
  status: "queued" | "running" | "done" | "failed" | "canceled" | "skipped";
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  worker_id: string;
  retry_count: number;
  agentic: boolean;
  prompt_prebuilt: boolean;
  review_type: string;
  patch_id: string;
  command_line: string;
  uuid: string;
  source_machine_id: string;
  repo_path: string;
  repo_name: string;
  commit_subject: string;
  closed: boolean;
  verdict: string;
}

export interface ReviewShowResponse {
  id: number;
  job_id: number;
  agent: string;
  prompt: string;
  output: string;
  created_at: string;
  closed: boolean;
  uuid: string;
  verdict_bool: number | null;
  job: ReviewShowJob;
}

export interface ReviewShowJob {
  id: number;
  repo_id: number;
  commit_id: number;
  git_ref: string;
  branch: string;
  session_id: string;
  agent: string;
  reasoning: string;
  job_type: string;
  status: string;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  worker_id: string;
  retry_count: number;
  agentic: boolean;
  prompt_prebuilt: boolean;
  review_type: string;
  patch_id: string;
  repo_path: string;
  repo_name: string;
  commit_subject: string;
  verdict: string;
}

export type ReviewGroup = "inProgress" | "needsAttention" | "passed" | "history";

export function classifyReview(job: ReviewJob): ReviewGroup {
  if (job.status === "queued" || job.status === "running") {
    return "inProgress";
  }
  if (
    (job.status === "done" && job.verdict === "F" && !job.closed) ||
    job.status === "failed"
  ) {
    return "needsAttention";
  }
  if (
    job.status === "done" &&
    (job.verdict === "P" || job.closed)
  ) {
    return "passed";
  }
  return "history";
}
