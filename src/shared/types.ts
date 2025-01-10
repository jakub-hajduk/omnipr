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
  [k: PropertyKey]: any;
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
  /**
   * Initializes the provider by setting up authentication and retrieving any necessary initial information.
   *
   * This method prepares the provider for use, allowing for customization through the provided options object.
   * The exact configuration depends on the specific provider implementation.
   *
   * @param {Object} options - Configuration options tailored to the provider.
   * @param {string} [options.url] - The URL of the provider (if applicable).
   * @param {string} [options.token] - The authentication token for accessing the provider (if required).
   * @param {Object} [options.auth] - An instance of a custom authentication class, e.g., `ProviderAuth`.
   *
   * @returns {Promise<void>} A promise that resolves when the setup is complete.
   *
   * @throws {Error} If the setup process encounters any issues (e.g., invalid credentials, missing fields).
   *
   * @example
   * // Setup using URL and token
   * await provider.setup({
   *   url: 'https://github.com/jakub-hajduk/omnipr',
   *   token: '<TOKEN>'
   * });
   *
   * @example
   * // Setup using a custom authentication class
   * await provider.setup({
   *   auth: new ProviderAuth()
   * });
   */
  setup(options: InitOptions): Promise<boolean>;

  /**
   * Prepares the source and target branches for the operation.
   *
   * This method ensures the specified branches are ready for use. If the `resetSourceBranchIfExists` option
   * is enabled, the source branch will be deleted and recreated to ensure a clean state.
   *
   * @param {BranchesOptions} options - Configuration options for preparing branches.
   * @param {string} options.sourceBranch - The name of the source branch to prepare.
   * @param {string} options.targetBranch - The name of the target branch to prepare.
   * @param {boolean} [options.resetSourceBranchIfExists=false] - Whether to delete and recreate the source branch if it already exists.
   *
   * @returns {Promise<void>} A promise that resolves when the branches are prepared.
   *
   * @throws {Error} If the branch preparation fails (e.g., branch deletion or creation issues).
   *
   * @example
   * // Prepare branches without resetting the source branch
   * await provider.prepareBranches({
   *   sourceBranch: 'update-build-settings',
   *   targetBranch: 'main'
   * });
   *
   * @example
   * // Prepare branches and reset the source branch if it exists
   * await provider.prepareBranches({
   *   sourceBranch: 'update-build-settings',
   *   targetBranch: 'main',
   *   resetSourceBranchIfExists: true
   * });
   */
  prepareBranches(options: BranchesOptions): Promise<boolean>;

  /**
   * Retrieves file contents from the source branch recursively.
   *
   * This method provides flexible options to fetch files based on the specified `path` and `files`.
   * The behavior varies depending on the combination of options provided:
   * - If `path` is specified, retrieves all files from the specified path.
   * - If both `path` and `files` are specified, retrieves only the specified files from the given path.
   * - If only `files` are specified, retrieves those files from their respective locations.
   * - If neither `path` nor `files` are provided, retrieves all files from the root directory. _(Note: This can result in a large response, potentially exceeding response limits.)_
   *
   * @param {ReadFilesOptions} options - Configuration for reading files from the source branch.
   * @param {string} [options.path] - The directory path to fetch files from (optional).
   * @param {string[]} [options.files] - A list of specific files to fetch (optional).
   *
   * @returns {Promise<Object>} A promise that resolves with an array of file objects containing their content.
   *
   * @example
   * // Get all files from a specific path
   * const files = await provider.getFilesFromSourceBranch({
   *   path: 'some/generated/files'
   * });
   * console.log(files);
   *
   * @example
   * // Get specific files by name
   * const files = await provider.getFilesFromSourceBranch({
   *   files: ['package.json', 'src/input-data/source.json']
   * });
   * console.log(files);
   *
   * @example
   * // Get specific files from a given path
   * const files = await provider.getFilesFromSourceBranch({
   *   path: 'src/settings',
   *   files: ['manifest.yml', 'plugin.yml', 'dependencies.yml']
   * });
   * console.log(files);
   */
  getFilesFromSourceBranch(
    options: ReadFilesOptions,
  ): Promise<Record<string, string>>;

  /**
   * Writes changes to the repository.
   *
   * This method allows you to apply changes to the repository by specifying the files and their content.
   * It supports writing changes to specific files or directories, providing flexibility for managing repository updates.
   *
   * @param {WriteChangesOptions} options - Configuration options for writing changes.
   * @param {Object} options.changes - An object representing the files to be written. Keys are file paths, and values are the file contents.
   * @param {string} [options.path] - The base directory for the changes. When specified, file paths in `changes` are relative to this directory (optional).
   *
   * @returns {Promise<boolean>} A promise that resolves once the changes are written successfully.
   *
   * @example
   * // Write a single file with its full path
   * await provider.writeChanges({
   *   changes: {
   *     'src/input/data.json': '{version: "0.0.1"}'
   *   }
   * });
   *
   * @example
   * // Write changes to a directory using relative paths
   * await provider.writeChanges({
   *   path: 'src/input',
   *   changes: {
   *     'data.json': '{version: "0.0.1"}'
   *   }
   * });
   */
  writeChanges(options: WriteChangesOptions): Promise<boolean>;

  /**
   * Creates a pull request for the provider.
   *
   * This method initiates a pull request (PR) with the specified title and description.
   * The exact behavior may depend on the provider implementation, including any default
   * reviewers or branch policies.
   *
   * @param {PullRequestOptions} options - Configuration options for the pull request.
   * @param {string} options.title - The title of the pull request.
   * @param {string} [options.description] - The description of the pull request, providing additional context (optional).
   *
   * @returns {Promise<boolean>} A promise that resolves when the pull request is successfully created.
   *
   * @example
   * // Create a simple pull request with a title and description
   * await provider.createPullRequest({
   *   title: 'Settings update',
   *   description: 'Settings update. PR automatically generated by OmniPR.'
   * });
   */
  createPullRequest(options: PullRequestOptions): Promise<boolean>;
}
