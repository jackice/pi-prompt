export type RuntimePhase = "idle" | "running" | "compacting" | "retry" | "blocked" | "unknown";

export interface SessionFacts {
  id?: string | undefined;
  name?: string | undefined;
  cwd: string;
}

export interface ModelFacts {
  id: string;
  name?: string | undefined;
  provider?: string | undefined;
  thinking?: string | undefined;
}

export interface GitFacts {
  branch?: string | undefined;
  worktree?: string | undefined;
  staged?: number | undefined;
  unstaged?: number | undefined;
  untracked?: number | undefined;
  conflicts?: number | undefined;
  stale: boolean;
}

export interface UsageFacts {
  input?: number | undefined;
  output?: number | undefined;
  cacheRead?: number | undefined;
  cacheWrite?: number | undefined;
  totalTokens?: number | undefined;
  costTotal?: number | undefined;
  costFromProvider?: boolean | undefined;
  scope: "session_file";
}

export interface ContextFacts {
  used?: number | undefined;
  capacity?: number | undefined;
  percent?: number | undefined;
  quality: "reported" | "estimated" | "unknown";
}

export interface RuntimeFacts {
  phase: RuntimePhase;
  durationMs?: number | undefined;
  tokensPerSecond?: number | undefined;
}

export interface PromptFacts {
  generation: number;
  revision: number;
  session: SessionFacts;
  model?: ModelFacts | undefined;
  git?: GitFacts | undefined;
  usage?: UsageFacts | undefined;
  context?: ContextFacts | undefined;
  runtime: RuntimeFacts;
  /** native 模式恒为空；replace 模式仅当前帧从公开 getter 读取。 */
  extensionStatuses: Readonly<Record<string, string>>;
}

export function createFacts(cwd: string, generation = 0): PromptFacts {
  return {
    generation,
    revision: 0,
    session: { cwd },
    runtime: { phase: "idle" },
    extensionStatuses: {},
  };
}
