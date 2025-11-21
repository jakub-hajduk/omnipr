export type FileChangeCallback = (fileInfo: {
  exists: boolean;
  path: string;
  contents: string;
}) => string | null;

export type FileChange = string | FileChangeCallback | null;

export interface PullRequestOptions {
  title: string;
  description?: string;
}

export interface BranchesOptions {
  resetSourceBranchIfExists?: boolean;
  sourceBranch: string;
  targetBranch: string;
}

export interface WriteChangesOptions {
  path?: string;
  changes: Record<string, FileChange>;
  commitMessage: string;
}

export interface ReadFilesOptions {
  path?: string;
  files?: string[];
}

export interface FetchOptions {
  customFetch?: typeof fetch;
}

export type OmniPROptions = BranchesOptions &
  WriteChangesOptions &
  PullRequestOptions &
  FetchOptions;

export interface Provider {
  fetch: typeof fetch;
  getBranchSha(branchName: string): Promise<string | undefined>;
  createBranch(branchName: string, sha: string): Promise<void>;
  deleteBranch(branchName: string): Promise<void>;
  getFileContent(
    branchName: string,
    filePath: string,
  ): Promise<string | undefined>;
  pull(
    branchName: string,
    path?: string,
    recursive?: boolean,
  ): Promise<Record<string, string>>;
  commitChanges(
    branchName: string,
    changes: Record<string, string | null>,
    commitMessage: string,
  ): Promise<void>;
  createPullRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string,
  ): Promise<string>;
}

export interface OmniPRReturn {
  pullFiles: (recursive?: boolean) => Promise<Record<string, string>>;
  createPr: () => Promise<string>;
}
