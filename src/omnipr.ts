import type { OmniPROptions, OmniPRReturn, Provider } from './shared/types';

export function omnipr(
  provider: Provider,
  options: OmniPROptions,
): OmniPRReturn {
  if (options.customFetch) {
    provider.fetch = options.customFetch;
  }

  async function pullFiles(recursive = false) {
    const files = await provider.pull(
      options.sourceBranch,
      options.path,
      recursive,
    );
    return files;
  }

  async function createPr() {
    // 1. Prepare branches
    const targetBranchSha = await provider.getBranchSha(options.targetBranch);

    if (!targetBranchSha) {
      throw new Error(`Target branch "${options.targetBranch}" not found.`);
    }

    const sourceBranchExists = await provider.getBranchSha(
      options.sourceBranch,
    );

    if (sourceBranchExists && options.resetSourceBranchIfExists) {
      await provider.deleteBranch(options.sourceBranch);
      await provider.createBranch(options.sourceBranch, targetBranchSha);
    } else if (!sourceBranchExists) {
      await provider.createBranch(options.sourceBranch, targetBranchSha);
    }

    // 2. Calculate changes
    const changes: Record<string, string | null> = {};
    for (const [filePath, change] of Object.entries(options.changes)) {
      if (typeof change === 'string' || change === null) {
        changes[filePath] = change as string;
      } else {
        const existingContent = await provider.getFileContent(
          options.sourceBranch,
          filePath,
        );
        changes[filePath] = change({
          exists: existingContent !== undefined,
          path: filePath,
          contents: existingContent ?? '',
        });
      }
    }

    // 3. Commit changes
    await provider.commitChanges(
      options.sourceBranch,
      changes,
      options.commitMessage,
    );

    // 4. Create pull request
    const pullRequestUrl = await provider.createPullRequest(
      options.sourceBranch,
      options.targetBranch,
      options.title,
      options.description,
    );

    return pullRequestUrl;
  }

  return {
    pullFiles,
    createPr,
  };
}
