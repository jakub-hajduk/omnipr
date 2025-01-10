export interface Change {
  files: Record<string, string>;
  commit: string;
}

export interface PullRequestOptions {
  url: string;
  token: string;
  title: string;
  description: string;
  path?: string;
  commit: string;
  branches: {
    source: string;
    target: string;
  };
}

export interface GitProviderPullRequestOptions
  extends Omit<PullRequestOptions, 'path' | 'commit'> {
  changes: Change[];
}

export interface GitProviderReturnType {
  status: number;
  message?: string;
}

export type GitProvider = (
  options: GitProviderPullRequestOptions,
) => Promise<any>;
