import fs from "node:fs/promises";
import path from "node:path";
import { PatchPlan, PatchOp } from "../schemas/PatchPlan.js";

export type ApplyResult = {
  file: string;
  existedBefore: boolean;
  before: string | null;
  after: string;
};

export class PatchApplier {
  constructor(private repoRoot: string) {}

  async apply(plan: PatchPlan): Promise<ApplyResult[]> {
    const results: ApplyResult[] = [];

    for (const op of plan.ops) {
      // Ensure the target path is safe and inside the repository root.
      this.ensureSafeRepoPath(op.file);

      const absPath = path.resolve(this.repoRoot, op.file);

      const existedBefore = await this.exists(absPath);

      if (op.type === "create_file") {
        if (existedBefore) {
          throw new Error(`create_file target already exists: ${op.file}`);
        }
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, op.patch, "utf8");
        results.push({ file: op.file, existedBefore, before: null, after: op.patch });
        continue;
      }

      const original = existedBefore ? await fs.readFile(absPath, "utf8") : "";

      let updated: string;

      if (op.type === "update_file") {
        if (!existedBefore) {
          // treat update_file on missing file as an error; caller can use create_file instead
          throw new Error(`update_file target does not exist: ${op.file}`);
        }
        updated = op.patch;
      } else {
        // line-based ops require the file to exist
        if (!existedBefore) {
          throw new Error(`Line-based op target does not exist: ${op.file}`);
        }
        updated = this.applyLineOp(original, op);
      }

      if (updated !== original) {
        await fs.writeFile(absPath, updated, "utf8");
      }

      results.push({
        file: op.file,
        existedBefore,
        before: existedBefore ? original : null,
        after: updated
      });
    }

    return results;
  }

  private applyLineOp(source: string, op: PatchOp): string {
    const lines = source.split("\n");

    switch (op.type) {
      case "replace_range": {
        if (op.end_line === null) throw new Error("replace_range requires end_line");
        const startIdx = op.start_line - 1;
        const endIdx = op.end_line; // slice end is exclusive
        const patchLines = op.patch.split("\n");

        return [
          ...lines.slice(0, startIdx),
          ...patchLines,
          ...lines.slice(endIdx)
        ].join("\n");
      }

      case "insert_after": {
        const insertIdx = op.start_line; // after start_line => insert at that index
        const patchLines = op.patch.split("\n");

        return [
          ...lines.slice(0, insertIdx),
          ...patchLines,
          ...lines.slice(insertIdx)
        ].join("\n");
      }

      case "delete_range": {
        if (op.end_line === null) throw new Error("delete_range requires end_line");
        const startIdx = op.start_line - 1;
        const endIdx = op.end_line;

        return [...lines.slice(0, startIdx), ...lines.slice(endIdx)].join("\n");
      }

      default:
        throw new Error(`applyLineOp received non-line op: ${op.type}`);
    }
  }

  private async exists(p: string): Promise<boolean> {
    try {
      const st = await fs.stat(p);
      return st.isFile();
    } catch {
      return false;
    }
  }

  private ensureSafeRepoPath(relPath: string) {
    // Prevent absolute/escaped paths and ensure the resolved path stays within repoRoot.
    if (!relPath || path.isAbsolute(relPath)) {
      throw new Error(`Unsafe file path (absolute or empty): ${relPath}`);
    }

    const repoRootResolved = path.resolve(this.repoRoot);
    const resolved = path.resolve(this.repoRoot, relPath);
    const relative = path.relative(repoRootResolved, resolved);

    // If relative starts with '..' we are outside the repo root.
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return; // safe
    }

    throw new Error(`Unsafe path outside repository root: ${relPath}`);
  }
}
