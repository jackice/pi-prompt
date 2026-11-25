import { describe, expect, it } from "vitest";

import { parseGitStatus, toGitFacts } from "../../src/status/git.ts";

function porcelain(lines: string[]): string {
  return lines.join("\u0000") + "\u0000";
}

describe("git porcelain v2 parser", () => {
  it("解析分支、staged/unstaged/untracked", () => {
    const output = porcelain([
      "# branch.oid abc123",
      "# branch.head develop",
      "1 M. N... 100644 100644 100644 aaa bbb src/a.ts",
      "1 .M N... 100644 100644 100644 aaa bbb src/b.ts",
      "? src/new.ts",
      "? notes.md",
    ]);
    const status = parseGitStatus(output);
    expect(status).toBeDefined();
    expect(status?.branch).toBe("develop");
    expect(status?.staged).toBe(1);
    expect(status?.unstaged).toBe(1);
    expect(status?.untracked).toBe(2);
  });

  it("rename 双记录只计一次并跳过原始路径", () => {
    const output = porcelain([
      "# branch.head main",
      "2 R. N... 100644 100644 100644 aaa bbb R100 new.ts",
      "old.ts",
      "? otro.ts",
    ]);
    const status = parseGitStatus(output);
    expect(status?.staged).toBe(1);
    expect(status?.unstaged).toBe(0);
    expect(status?.untracked).toBe(1);
  });

  it("冲突路径单独计数", () => {
    const output = porcelain([
      "# branch.head main",
      "u UU N... 100644 100644 100644 100644 aaa bbb ccc conflict.ts",
    ]);
    const status = parseGitStatus(output);
    expect(status?.conflicts).toBe(1);
    expect(status?.unstaged).toBe(1);
  });

  it("detached 与 unborn", () => {
    expect(parseGitStatus(porcelain(["# branch.head (detached)"]))?.branch).toBe("detached");
    const unborn = parseGitStatus(porcelain(["# branch.oid (initial)", "# branch.head main"]));
    expect(unborn?.branch).toBe("main");
  });

  it("空输出与无 repo 内容返回 undefined", () => {
    expect(parseGitStatus("")).toBeUndefined();
    expect(parseGitStatus(porcelain(["# random"]))).toBeUndefined();
  });

  it("转换为 PromptFacts 的 GitFacts", () => {
    const facts = toGitFacts({ branch: "main", staged: 2, unstaged: 1, untracked: 3, conflicts: 0 }, true);
    expect(facts).toEqual({ branch: "main", staged: 2, unstaged: 1, untracked: 3, conflicts: 0, stale: true });
  });
});
