import type { GitProvider, OmniPROptions } from './shared/types';

export async function pullRequest<
  Provider extends GitProvider<any>,
  AuthOptions = Parameters<Provider['setup']>[0],
>(provider: Provider, options: OmniPROptions & AuthOptions) {
  const {
    sourceBranch,
    targetBranch,
    resetSourceBranchIfExists,
    path,
    commitMessage,
    changes,
    title,
    description,
    ...auth
  } = options;

  const setupResult = await provider.setup(auth);

  if (!setupResult) {
    throw new Error(`Couldn't setup the connection to git provider.`);
  }

  const prepareBranchesResult = await provider.prepareBranches({
    sourceBranch,
    targetBranch,
    resetSourceBranchIfExists,
  });

  if (!prepareBranchesResult) {
    throw new Error(`Couldn't setup branches.`);
  }

  const writeChanges = await provider.writeChanges({
    path,
    commitMessage,
    changes,
  });

  if (!writeChanges) {
    throw new Error(`Couldn't write changes.`);
  }

  const createPullRequestResult = provider.createPullRequest({
    title,
    description,
  });

  if (!createPullRequestResult) {
    throw new Error(`Couldn't create the Pull request!`);
  }
}
