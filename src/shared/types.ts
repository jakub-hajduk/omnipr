export type Change =
  | string
  | ((file: { exists: boolean; path: string; contents: string }) =>
      | string
      | null)
  | null;

export interface PullRequestOptions {
  title: string;
  description?: string;
}

export interface BranchesOptions {
  resetSourceBranchIfExists?: boolean;
  sourceBranch: string;
  targetBranch: string;
}

export interface GitProviderReturnType {
  status: number;
  message?: string;
}

export interface TokenProviderOptions {
  token: string;
  url: string;
}

export interface PullRequestOptions {
  title: string;
  description?: string;
}

export interface WriteChangesOptions {
  path?: string;
  changes: Record<string, Change>;
  commitMessage: string;
}

export interface ReadFilesOptions {
  path?: string;
  files?: string[];
}

export type OmniPROptions = BranchesOptions &
  WriteChangesOptions &
  PullRequestOptions &
  TokenProviderOptions;

export interface GitProvider<InitOptions> {
  setup(options: InitOptions): Promise<boolean>;

  prepareBranches(options: BranchesOptions): Promise<boolean>;

  writeChanges(options: WriteChangesOptions): Promise<boolean>;

  getFilesFromSourceBranch(
    options: ReadFilesOptions,
  ): Promise<Record<string, string>>;

  createPullRequest(options: PullRequestOptions): Promise<boolean>;
}
