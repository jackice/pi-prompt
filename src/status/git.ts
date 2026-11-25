import type { GitFacts } from "./facts.ts";

export interface GitStatus {
  branch?: string | undefined;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
}

export function parseGitStatus(output: string): GitStatus | undefined {
  if (output.length === 0) return undefined;
  const status: GitStatus = { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
  const tokens = output.split("\u0000");
  let sawHeader = false;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined || token.length === 0) continue;

    if (token.startsWith("# branch.head ")) {
      const name = token.slice("# branch.head ".length).trim();
      status.branch = name === "(detached)" ? "detached" : name;
      sawHeader = true;
      continue;
    }
    if (token.startsWith("# branch.oid ")) {
      const oid = token.slice("# branch.oid ".length).trim();
      if (oid === "(initial)") status.branch = status.branch ?? "unborn";
      sawHeader = true;
      continue;
    }
    if (token.startsWith("# branch.ab")) {
      sawHeader = true;
      continue;
    }
    if (token.startsWith("# ")) continue;

    const kind = token.slice(0, 2);
    if (kind === "1 ") {
      const fields = token.split(" ");
      const xy = fields[1] ?? "..";
      if (xy[0] !== undefined && xy[0] !== ".") status.staged++;
      if (xy[1] !== undefined && xy[1] !== ".") status.unstaged++;
      continue;
    }
    if (kind === "2 ") {
      const fields = token.split(" ");
      const xy = fields[1] ?? "..";
      if (xy[0] !== undefined && xy[0] !== ".") status.staged++;
      if (xy[1] !== undefined && xy[1] !== ".") status.unstaged++;
      // rename/copy 的原始路径是紧随其后的独立 NUL 记录。
      index++;
      continue;
    }
    if (kind === "u ") {
      status.conflicts++;
      status.unstaged++;
      continue;
    }
    if (kind === "? ") {
      status.untracked++;
      continue;
    }
    if (kind === "! ") continue;
  }

  return sawHeader || status.staged + status.unstaged + status.untracked + status.conflicts > 0
    ? status
    : undefined;
}

export interface GitFactsFromStatus {
  branch?: string | undefined;
  staged?: number | undefined;
  unstaged?: number | undefined;
  untracked?: number | undefined;
  conflicts?: number | undefined;
}

export function toGitFacts(status: GitStatus, stale = false): GitFacts {
  return {
    branch: status.branch,
    staged: status.staged,
    unstaged: status.unstaged,
    untracked: status.untracked,
    conflicts: status.conflicts,
    stale,
  };
}

export interface GitExecResult {
  stdout: string;
  code: number;
}

export type GitExec = (
  args: readonly string[],
  options: { cwd: string; timeout: number; signal: AbortSignal },
) => Promise<GitExecResult>;

export interface GitProviderOptions {
  cwd: string;
  exec: GitExec;
  ttlMs: number;
  timeoutMs?: number;
  onUpdate: (status: GitStatus | undefined, stale: boolean) => void;
  now?: () => number;
}

const GIT_ARGS = ["--no-optional-locks", "status", "--porcelain=v2", "-z", "--branch"] as const;

export class GitProvider {
  private options: GitProviderOptions;
  private cwd: string;
  private inflight: AbortController | undefined;
  private pending = false;
  private disposed = false;
  private generation = 0;
  private lastAt = 0;

  constructor(options: GitProviderOptions) {
    this.options = options;
    this.cwd = options.cwd;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  setCwd(cwd: string): void {
    if (cwd === this.cwd) return;
    this.cwd = cwd;
    this.generation++;
    this.inflight?.abort();
    this.inflight = undefined;
    this.pending = false;
    this.lastAt = 0;
  }

  refresh(force = false): void {
    if (this.disposed) return;
    if (this.inflight) {
      this.pending = true;
      return;
    }
    if (!force && this.now() - this.lastAt < this.options.ttlMs) return;
    this.lastAt = this.now();
    const controller = new AbortController();
    this.inflight = controller;
    const generation = this.generation;
    const cwd = this.cwd;
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 2000);

    void this.options
      .exec(GIT_ARGS, { cwd, timeout: 2000, signal: controller.signal })
      .then((result) => {
        if (this.disposed || generation !== this.generation) return;
        if (result.code !== 0) {
          this.options.onUpdate(undefined, false);
          return;
        }
        const parsed = parseGitStatus(result.stdout);
        this.options.onUpdate(parsed, false);
      })
      .catch(() => {
        if (this.disposed || generation !== this.generation) return;
        this.options.onUpdate(undefined, true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (this.inflight === controller) this.inflight = undefined;
        if (this.pending && !this.disposed) {
          this.pending = false;
          this.refresh(true);
        }
      });
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.pending = false;
    this.inflight?.abort();
    this.inflight = undefined;
  }
}
