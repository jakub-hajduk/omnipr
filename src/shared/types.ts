/**
 * Represents a callback function used to determine file content changes.
 * This function is invoked for each file specified in the `changes` object when committing.
 *
 * @example
 * // Example: Append a new line to an existing file or create it
 * (fileInfo) => {
 *   if (fileInfo.exists) {
 *     return fileInfo.contents + '\\n// Appended by OmniPR';
 *   }
 *   return '// New file created by OmniPR';
 * }
 *
 * @example
 * // Example: Delete a file if it exists, otherwise do nothing
 * (fileInfo) => {
 *   if (fileInfo.exists) {
 *     return null; // Deletes the file
 *   }
 *   return fileInfo.contents; // No change if file doesn't exist
 * }
 */
export type FileChangeCallback = (fileInfo: {
  exists: boolean;
  path: string;
  contents: string;
}) => string | null;

/**
 * Represents a change to be applied to a file.
 * It can be a string (new content), a FileChangeCallback function (dynamic content), or null (delete file).
 *
 * @example
 * // Directly provide new content for a file
 * 'path/to/file.txt': 'This is the new content.'
 *
 * @example
 * // Use a callback to update content based on existing content
 * 'path/to/script.js': ({ contents }) => contents + '\\nconsole.log(\\"Updated!\\");'
 *
 * @example
 * // Delete a file
 * 'path/to/old-file.txt': null
 */
export type FileChange = string | FileChangeCallback | null;

/**
 * Options for creating a pull request.
 */
export interface PullRequestOptions {
  /**
   * The title of the pull request.
   */
  title: string;
  /**
   * An optional description for the pull request.
   */
  description?: string;
}

/**
 * Options related to source and target branches for the pull request operation.
 */
export interface BranchesOptions {
  /**
   * If true, the source branch will be deleted and recreated from the target branch's SHA if it already exists.
   * This ensures a clean slate for the source branch.
   */
  resetSourceBranchIfExists?: boolean;
  /**
   * The name of the source branch from which the changes will be pulled.
   */
  sourceBranch: string;
  /**
   * The name of the target branch into which the changes will be merged.
   */
  targetBranch: string;
}

/**
 * Options for writing changes (committing files) to the repository.
 */
export interface WriteChangesOptions {
  /**
   * An optional base path within the repository for the changes.
   * If provided, file paths in `changes` will be relative to this path.
   */
  path?: string;
  /**
   * A record where keys are file paths (relative to `path` if provided) and values are `FileChange` types.
   * @example
   * {
   *   'config.json': '{ "version": "1.0.0" }',
   *   'src/main.ts': ({ contents }) => contents.replace('old', 'new'),
   *   'old-feature.js': null, // Deletes the file
   * }
   */
  changes: Record<string, FileChange>;
  /**
   * The commit message for the changes.
   */
  commitMessage: string;
}

/**
 * Options for providing a custom fetch implementation.
 */
export interface FetchOptions {
  /**
   * An optional custom `fetch` function to use for HTTP requests.
   * Useful for testing or integrating with specific environments (e.g., polyfills).
   */
  customFetch?: typeof fetch;
}

/**
 * The combined options object for the `omnipr` function.
 */
export type OmniPROptions = BranchesOptions &
  WriteChangesOptions &
  PullRequestOptions &
  FetchOptions;

/**
 * Defines the contract for a Git provider (e.g., GitHub, GitLab, Bitbucket).
 * Each provider implementation must adhere to this interface.
 */
export interface Provider {
  /**
   * The fetch function to be used by the provider for making HTTP requests.
   * This is typically passed down from `OmniPROptions.customFetch` or uses the global `fetch`.
   */
  fetch: typeof fetch;
  /**
   * Retrieves the SHA hash of a given branch.
   */
  getBranchSha(branchName: string): Promise<string | undefined>;
  /**
   * Creates a new branch pointing to a specific SHA.
   */
  createBranch(branchName: string, sha: string): Promise<void>;
  /**
   * Deletes a specified branch.
   */
  deleteBranch(branchName: string): Promise<void>;
  /**
   * Retrieves the content of a specific file from a given branch.
   */
  getFileContent(
    branchName: string,
    filePath: string,
  ): Promise<string | undefined>;
  /**
   * Pulls all files (or files within a specific path) from a given branch.
   */
  pull(
    branchName: string,
    path?: string,
    recursive?: boolean,
  ): Promise<Record<string, string>>;
  /**
   * Commits changes to a specified branch.
   *   (string) or `null` to delete the file.
   */
  commitChanges(
    branchName: string,
    changes: Record<string, string | null>,
    commitMessage: string,
  ): Promise<void>;
  /**
   * Creates a pull request between a source and target branch.
   */
  createPullRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string,
  ): Promise<string>;
}

/**
 * The return type of the `omnipr` function, providing methods to interact with the prepared PR operation.
 *
 */
export interface OmniPRReturn {
  /**
   * Pulls files from the source branch defined in the initial `omnipr` call.
   *
   * @example
   * const prSetup = omnipr(provider, { ...options });
   * const files = await prSetup.pullFiles(true); // Pull all files recursively from the source branch
   * console.log(files);
   */
  pullFiles: (recursive?: boolean) => Promise<Record<string, string>>;
  /**
   * Creates the pull request based on the options provided during the initial `omnipr` call.
   *
   * @example
   * const prSetup = omnipr(provider, { ...options });
   * const prUrl = await prSetup.createPr();
   * console.log(`Pull Request URL: ${prUrl}`);
   */
  createPr: () => Promise<string>;
}
