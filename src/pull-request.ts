import type { GitProvider, OmniPROptions } from './shared/types';

export async function pullRequest(
  provider: GitProvider<any>,
  options: OmniPROptions,
) {
  const setupResult = await provider.setup({
    url: options.url,
    token: options.token,
  });

  if (!setupResult) {
    throw new Error(`Couldn't setup the connection to git provider.`);
  }

  const prepareBranchesResult = await provider.prepareBranches({
    sourceBranch: options.sourceBranch,
    targetBranch: options.targetBranch,
    resetSourceBranchIfExists: options.resetSourceBranchIfExists,
  });

  if (!prepareBranchesResult) {
    throw new Error(`Couldn't setup branches.`);
  }

  const writeChanges = await provider.writeChanges({
    path: options.path,
    commitMessage: options.commitMessage,
    changes: options.changes,
  });

  if (!writeChanges) {
    throw new Error(`Couldn't write changes.`);
  }

  const createPullRequestResult = provider.createPullRequest({
    title: options.title,
    description: options.description,
  });

  if (!createPullRequestResult) {
    throw new Error(`Couldn't create the Pull request!`);
  }
}
