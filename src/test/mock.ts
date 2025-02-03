import { errors } from '../shared/errors';
import type {
  Branch,
  Commit,
  CommitOptions,
  Files,
  GetFileOptions,
  GetFilesOptions,
  GitProvider,
  PullRequest,
  PullRequestOptions,
} from '../shared/types';

export class MockGitProvider implements GitProvider<any> {
  private branches: Map<string, Branch> = new Map([
    ['main', { name: 'main', commit: { sha: 'main' } }],
  ]);
  private commits: Map<string, Commit[]> = new Map();
  private files: Map<string, Files> = new Map();
  private pullRequests: PullRequest[] = [];

  async setup(auth: any) {
    if (!auth) {
      throw errors.couldntSetupConnection();
    }
  }

  async createBranch(from: string, name: string): Promise<Branch> {
    const fromBranch = await this.getBranch(from);
    const newBranch: Branch = { name, commit: { sha: fromBranch.commit.sha } };
    this.branches.set(name, newBranch);
    return newBranch;
  }

  async getBranch(name: string): Promise<Branch> {
    const branch = this.branches.get(name);
    if (!branch) throw errors.branchDoesNotExist(name);
    return branch;
  }

  async deleteBranch(name: string): Promise<void> {
    if (!this.branches.has(name)) throw errors.branchDoesNotExist(name);
    this.branches.delete(name);
  }

  async commitToBranch(options: CommitOptions): Promise<Commit> {
    const branch = await this.getBranch(options.branch);
    const commit: Commit = {
      message: options.commitMessage,
      sha: `${Date.now()}`,
      author: { name: 'mock', email: 'mock@example.com' },
      date: new Date().toISOString(),
    };
    const branchCommits = this.commits.get(branch.name) || [];
    branchCommits.push(commit);
    this.commits.set(branch.name, branchCommits);

    const branchFiles = this.files.get(branch.name) || {};

    for (const [file, contents] of Object.entries(options.changes)) {
      const filePath = options.path ? `${options.path}/${file}` : file;
      branchFiles[filePath] = contents;
    }

    this.files.set(branch.name, branchFiles);

    return commit;
  }

  async getFileContents(options: GetFileOptions): Promise<string> {
    const branchFiles = this.files.get(options.branch);
    if (!branchFiles)
      throw errors.couldntReadFileContents(options.branch, options.file);
    const filePath = options.path
      ? `${options.path}/${options.file}`
      : options.file;
    const contents = branchFiles[filePath];
    if (!contents)
      throw errors.couldntReadFileContents(options.branch, options.file);
    return contents;
  }

  async getFromBranch(options: GetFilesOptions): Promise<Files> {
    const branchFiles = this.files.get(options.branch);
    if (!branchFiles) throw errors.couldntReadFiles(options.branch);
    return branchFiles;
  }

  async createPullRequest(options: PullRequestOptions): Promise<PullRequest> {
    const pullRequest: PullRequest = {
      title: options.title,
      description: options.description,
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
      id: `${this.pullRequests.length + 1}`,
      link: `http://mock/${this.pullRequests.length + 1}`,
    };
    this.pullRequests.push(pullRequest);
    return pullRequest;
  }

  async getBranches(): Promise<Branch[]> {
    return Array.from(this.branches.values());
  }

  async getPullRequests(): Promise<PullRequest[]> {
    return this.pullRequests;
  }

  async getCommits(branch: string): Promise<Commit[]> {
    return this.commits.get(branch) || [];
  }
}
