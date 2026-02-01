import simpleGit, { SimpleGit } from "simple-git";

export class GitService {
  private git: SimpleGit;

  constructor(repoRoot: string) {
    this.git = simpleGit(repoRoot);
  }

  async getHeadSha(): Promise<string> {
    return (await this.git.revparse(["HEAD"])).trim();
  }

  async checkout(branch: string) {
    await this.git.checkout(branch);
  }

  async createBranch(branch: string) {
    await this.git.checkoutLocalBranch(branch);
  }

  async addAllAndCommit(message: string): Promise<string> {
    await this.git.add(".");
    const res = await this.git.commit(message);
    return res.commit;
  }

  async diffNameStatus(base: string): Promise<string> {
    return this.git.diff(["--name-status", base]);
  }

  async diffUnified(base: string, maxBytes: number): Promise<string> {
    const diff = await this.git.diff([base]);
    return diff.length > maxBytes ? diff.slice(0, maxBytes) : diff;
  }

  async status() {
    return this.git.status();
  }

  async listLocalBranches(): Promise<string[]> {
    const out = await this.git.raw([
      "branch",
      "--format=%(refname:short)",
    ]);
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async deleteBranch(branch: string, force = false) {
    await this.git.raw(["branch", force ? "-D" : "-d", branch]);
  }

  async merge(branch: string) {
    await this.git.raw(["merge", "--no-ff", branch]);
  }
}
