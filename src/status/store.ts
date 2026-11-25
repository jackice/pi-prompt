import { createFacts, type PromptFacts } from "./facts.ts";

export type FactsPatch = Partial<Omit<PromptFacts, "generation" | "revision">>;

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(
    (a as Record<string, unknown>)[key],
    (b as Record<string, unknown>)[key],
  ));
}

export class PromptStore {
  private current: PromptFacts;
  private readonly listeners = new Set<() => void>();

  constructor(cwd: string, generation = 0) {
    this.current = createFacts(cwd, generation);
  }

  get(): PromptFacts {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: FactsPatch): boolean {
    const entries = Object.entries(patch) as [keyof FactsPatch, unknown][];
    const changed = entries.some(([key, value]) => !sameValue(this.current[key], value));
    if (!changed) return false;
    this.current = {
      ...this.current,
      ...patch,
      revision: this.current.revision + 1,
    };
    for (const listener of this.listeners) listener();
    return true;
  }

  bumpGeneration(): void {
    this.current = {
      ...this.current,
      generation: this.current.generation + 1,
      revision: this.current.revision + 1,
    };
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    this.listeners.clear();
  }
}
