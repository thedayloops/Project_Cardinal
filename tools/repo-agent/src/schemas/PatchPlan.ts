export type PatchOpType =
  | "replace_range"
  | "insert_after"
  | "delete_range"
  | "create_file"
  | "update_file";

export type PatchOp = {
  id: string;

  // relative to repo root
  file: string;

  type: PatchOpType;

  /**
   * Line-based ops:
   * - replace_range: start_line>=1, end_line>=start_line
   * - insert_after: start_line>=1, end_line=null
   * - delete_range: start_line>=1, end_line>=start_line, patch must be ""
   *
   * File-based ops:
   * - create_file: start_line=1, end_line=null, patch is full content
   * - update_file: start_line=1, end_line=null, patch is full content
   */
  start_line: number;
  end_line: number | null;

  /**
   * For line-based ops: replacement/inserted text (or "" for delete_range)
   * For file-based ops: full file content
   */
  patch: string;

  before_summary: string;
  after_summary: string;

  reversible: true;
};

export type PatchPlan = {
  meta: {
    goal: string;
    rationale: string;
    confidence: number;
  };

  scope: {
    files: string[];
    total_ops: number;
    estimated_bytes_changed: number;
  };

  ops: PatchOp[];

  expected_effects: string[];

  verification: {
    steps: string[];
    success_criteria: string[];
  };
};
