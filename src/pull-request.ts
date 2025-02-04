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
}
