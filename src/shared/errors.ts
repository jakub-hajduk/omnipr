export class OmniPRError extends Error {
  constructor(
    public message: string,
    public details?: any,
  ) {
    super(message);
  }
}

export const errors = {
  couldntCreatePullRequest: (
    sourceBranch: string,
    targetBranch: string,
    details: any,
  ) =>
    new OmniPRError(
      `Couldn't create or update pull request from "${sourceBranch}" to "${targetBranch}".`,
      details,
    ),

  couldntWriteFiles: (branch: string, details: any) =>
    new OmniPRError(`Couldn't write files on "${branch}" branch.`, details),

  branchDoesNotExist: (branch: string, details: any) =>
    new OmniPRError(`Branch "${branch}" does not exist.`, details),

  branchAlreadyExists: (branch: string, details: any) =>
    new OmniPRError(`Branch "${branch}" already exists.`, details),

  couldntReadFiles: (branch: string, details: any) =>
    new OmniPRError(`Couldn't read files from branch "${branch}"`, details),

  couldntReadFileContents: (branch: string, file: string, details: any) =>
    new OmniPRError(
      `Couldn't read contents from "${file}" file from "${branch}".`,
      details,
    ),

  temporary: (message: string, details?: any) =>
    new OmniPRError(`${message} (TODO: Support this error)`, details),
};
