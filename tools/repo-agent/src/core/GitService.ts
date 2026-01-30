import simpleGit, { SimpleGit } from "simple-git";

export class GitService {
  private git: SimpleGit;

  constructor(private repoRoot: string) {
    this.git = simpleGit(repoRoot, { binary: "git" });
  }

  async getHeadSha(): Promise<string> {
    return (await this.git.revparse(["HEAD"])).trim();
  }

  async getCurrentBranch(): Promise<string> {
    const b = await this.git.branch();
    return b.current;
  }

  async statusSummary(): Promise<string> {
    const s = await this.git.status();
    return `branch=${s.current} ahead=${s.ahead} behind=${s.behind} modified=${s.modified.length} created=${s.created.length} deleted=${s.deleted.length}`;
  }

  async createBranch(branchName: string): Promise<void> {
    await this.git.checkoutLocalBranch(branchName);
  }

  async checkout(ref: string): Promise<void> {
    await this.git.checkout(ref);
  }

  async addAllAndCommit(message: string): Promise<string> {
    await this.git.add(["-A"]);
    const res = await this.git.commit(message);
    return res.commit;
  }

  async diffNameStatus(baseRef: string): Promise<string> {
    return await this.git.diff(["--name-status", `${baseRef}..HEAD`]);
  }

  async diffUnified(baseRef: string, maxChars: number): Promise<string> {
    const d = await this.git.diff([`${baseRef}..HEAD`]);
    if (d.length <= maxChars) return d;
    return d.slice(0, maxChars) + `\n...TRUNCATED (${d.length} chars total)`;
  }

  async mergeInto(targetBranch: string, sourceBranch: string): Promise<void> {
    await this.git.checkout(targetBranch);
    await this.git.merge([sourceBranch, "--no-ff"]);
  }
}
