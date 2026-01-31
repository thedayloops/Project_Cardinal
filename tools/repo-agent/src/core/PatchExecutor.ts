// tools/repo-agent/src/core/PatchExecutor.ts
import fs from "node:fs/promises";
import path from "node:path";
import type { PatchOp } from "../schemas/PatchPlan.js";

type ExecOpts = {
  repoRoot: string;
};

export class PatchExecutor {
  constructor(private opts: ExecOpts) {}

  async applyAll(ops: PatchOp[]): Promise<void> {
    // Apply in order; any failure aborts immediately
    for (const op of ops) {
      await this.applyOne(op);
    }
  }

  private absPath(rel: string): string {
    const root = path.resolve(this.opts.repoRoot);
    const abs = path.resolve(root, rel);

    // Sandbox: must remain within repoRoot
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      throw new Error(`Path escapes repoRoot: ${rel}`);
    }
    return abs;
  }

  private async fileExists(p: string): Promise<boolean> {
    try {
      const s = await fs.stat(p);
      return s.isFile();
    } catch {
      return false;
    }
  }

  private async readLines(abs: string): Promise<string[]> {
    const raw = await fs.readFile(abs, "utf8");
    return raw.split(/\r?\n/);
  }

  private async writeLines(abs: string, lines: string[]): Promise<void> {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, lines.join("\n"), "utf8");
  }

  private splitPatch(patch: string | null | undefined): string[] {
    const txt = patch ?? "";
    if (txt.length === 0) return [];
    return txt.replace(/\r\n/g, "\n").split("\n");
  }

  private async applyOne(op: PatchOp): Promise<void> {
    const abs = this.absPath(op.file);

    switch (op.type) {
      case "create_file": {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, op.patch ?? "", "utf8");
        return;
      }

      case "update_file": {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, op.patch ?? "", "utf8");
        return;
      }

      case "insert_after":
      case "replace_range":
      case "delete_range": {
        if (!(await this.fileExists(abs))) {
          throw new Error(`Target file does not exist: ${op.file} (op ${op.id})`);
        }

        const lines = await this.readLines(abs);

        // start_line is 1-based
        const startIdx = op.start_line - 1;
        if (startIdx < 0 || startIdx > lines.length) {
          throw new Error(`start_line out of bounds: ${op.file} (op ${op.id})`);
        }

        const patchLines = this.splitPatch(op.patch);

        if (op.type === "insert_after") {
          // Insert AFTER start_line → insert at startIdx + 1
          const insertAt = startIdx + 1;
          lines.splice(insertAt, 0, ...patchLines);
          await this.writeLines(abs, lines);
          return;
        }

        // For replace/delete we require end_line
        if (op.end_line === null) {
          throw new Error(`${op.type} requires end_line: ${op.file} (op ${op.id})`);
        }

        const endIdx = op.end_line - 1;
        if (endIdx < startIdx || endIdx >= lines.length) {
          throw new Error(`end_line out of bounds: ${op.file} (op ${op.id})`);
        }

        if (op.type === "delete_range") {
          // Guardrails require patch to be empty; still enforce here
          if ((op.patch ?? "").trim().length > 0) {
            throw new Error(`delete_range patch must be empty (op ${op.id})`);
          }
          lines.splice(startIdx, endIdx - startIdx + 1);
          await this.writeLines(abs, lines);
          return;
        }

        // replace_range
        lines.splice(startIdx, endIdx - startIdx + 1, ...patchLines);
        await this.writeLines(abs, lines);
        return;
      }

      default: {
        const _exhaustive: never = op.type;
        throw new Error(`Unknown op type: ${_exhaustive}`);
      }
    }
  }
}
