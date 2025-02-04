export interface PullRequestOptions {
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
}

export interface BranchesOptions {
  resetSourceBranchIfExists?: boolean;
  sourceBranch: string;
  targetBranch: string;
}

export interface TokenProviderOptions {
  [k: PropertyKey]: any;
}

export interface PullRequestOptions {
  title: string;
  description?: string;
}

export interface CommitOptions {
  branch: string;
  path?: string;
  changes: Record<string, string>;
  commitMessage: string;
}

export interface GetFileOptions {
  branch: string;
  file: string;
  path?: string;
}

export interface GetFilesOptions {
  branch: string;
  path?: string;
}

export type Files = Record<string, string>;

export interface Branch {
  name: string;
  commit: {
    sha: string;
  };
}

export interface PullRequest {
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  id: string;
  link: string;
}

export interface Commit {
  message: string;
  sha: string;
  author: {
    name: string;
    email: string;
  };
  date: string;
}

export function isObject(value: any): value is object {
  return value.constructor.name === 'Object';
}

export function isBranch(value: string | Branch): value is Branch {
  return isObject(value) && 'name' in value && 'commit' in value;
}

export type OmniPROptions = BranchesOptions &
  CommitOptions &
  PullRequestOptions &
  TokenProviderOptions;

export interface GitProvider<InitOptions> {
  /**
   * Sets up the Git provider with authentication details.
   * @param {InitOptions} options - Authentication options containing token and repository URL.
   * @returns {Promise<boolean>} Returns `true` when setup is successful.
   * @example
   * const provider = new Provider({...})
   *
   * await provider.setup({
   *   url: 'https://git.com/repo'
   *   token: 'token_1234567890'
   * })
   */
  setup(options: InitOptions): Promise<void>;

  /**
   * Retrieves a branch by name.
   * @param {string} name - The name of the branch.
   * @returns {Promise<Branch>} The branch object containing its commit SHA.
   * @throws {OmniPRError} If the branch does not exist.
   * @example
   * const branch = await provider.getBranch('main');
   * console.log(branch.name);
   */
  getBranch(name: string): Promise<Branch>;

  /**
   * Creates a new branch from an existing branch.
   * @param {string | Branch} from - The name of the branch to copy from or an existing branch object.
   * @param {string} name - The new branch name.
   * @returns {Promise<Branch>} The newly created branch object.
   * @throws {OmniPRError} If the branch already exists.
   * @example
   * const branch = await provider.createBranch('main', 'feature-branch');
   */
  createBranch(from: string, name: string): Promise<Branch>;

  /**
   * Deletes a branch by name or branch object.
   * @param {string | Branch} name - The branch name or branch object to delete.
   * @returns {Promise<boolean>} Returns `true` if deletion is successful.
   * @throws {OmniPRError} If the branch does not exist.
   * @example
   * await provider.deleteBranch('feature-branch');
   */
  deleteBranch(name: string): Promise<void>;

  /**
   * Reads the contents of a file from a branch.
   * @param {GetFileOptions} options - The options including branch, file path, and file name.
   * @returns {Promise<string>} The file contents as a string.
   * @throws {OmniPRError} If the file cannot be read.
   * @example
   * const content = await provider.getFileContents({
   *   branch: 'main',
   *   file: 'config/config.json',
   * });
   *
   * @example
   * const content = await provider.fetchFile({
   *   branch: 'main',
   *   path: 'dir/subdir',
   *   file: 'version.txt',
   * });
   */
  fetchFile(options: GetFileOptions): Promise<string>;

  /**
   * Retrieves all files from given path from given branch.
   * @param {GetFilesOptions} options - Options including the branch and optional path.
   * @returns {Promise<Files>} An object containing file names as keys and their contents as values.
   * @throws {OmniPRError} If the files cannot be read.
   * @example
   * const mainBranch = provider.getBranch('main');
   * const files = await provider.getFromBranch({ branch: mainBranch });
   *
   * @example
   * const files = await provider.fetch({ branch: 'main', path: 'dir/subdir' });
   */
  fetch(options: GetFilesOptions): Promise<Files>;

  /**
   * Commits changes to a specified branch.
   * @param {CommitOptions} options - Options including branch, file changes, commit message, and optional path.
   * @returns {Promise<void>} Resolves when the commit is successfully created.
   * @throws {OmniPRError} If the commit cannot be completed.
   * @example
   * // Commit changes to the 'main' branch
   * await provider.push({
   *   branch: 'main',
   *   path: 'configuration',
   *   changes: { 'file.txt': 'Updated content' },
   *   commitMessage: 'Updated file.txt'
   * });
   */
  push(options: CommitOptions): Promise<Commit>;

  /**
   * Creates a pull request from a source branch to a target branch.
   * @param {PullRequestOptions} options - Options including source branch, target branch, title, and description.
   * @returns {Promise<string>} The URL of the created or existing pull request.
   * @throws {Error} If the pull request cannot be created.
   * @example
   * // Create a pull request from 'feature-branch' to 'main'
   * const prUrl = await githubProvider.createPullRequest({
   *   sourceBranch: 'feature-branch',
   *   targetBranch: 'main',
   *   title: 'New Feature',
   *   description: 'Adding a new feature'
   * });
   * console.log(pr);
   */
  createPullRequest(options: PullRequestOptions): Promise<PullRequest>;

  /**
   * Retrieves all branches from the repository.
   * @returns {Promise<Branch[]>} An array of branch objects.
   * @throws {OmniPRError} If the branches cannot be retrieved.
   * @example
   * const branches = await provider.getBranches();
   * console.log(branches);
   */
  getBranches(): Promise<Branch[]>;

  /**
   * Retrieves all pull requests from the repository.
   */
  getPullRequests(): Promise<PullRequest[]>;

  /**
   * Retrieves all commits from a branch.
   * @param branch
   * @example
   * const commits = await provider.getCommits('main');
   */
  getCommits(branch: string): Promise<Commit[]>;
}
