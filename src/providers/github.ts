import { Octokit } from '@octokit/rest';
import { createPullRequest } from 'octokit-plugin-create-pull-request';
import { GitProviderError } from '../shared/git-provider-error';
import type {
  GitProviderPullRequestOptions,
  GitProviderReturnType,
} from '../shared/types';

export async function github(
  options: GitProviderPullRequestOptions,
): Promise<GitProviderReturnType> {
  const OctokitExtended = Octokit.plugin(createPullRequest);

  const octokit = new OctokitExtended({
    auth: options.token,
  });

  const repoUrl = new URL(options.url);
  const [owner, repo] = repoUrl.pathname.split('/').splice(1);

  await octokit
    .createPullRequest({
      owner,
      repo,
      title: options.title,
      body: options.description,
      base: options.branches.target,
      head: options.branches.source,
      update: true,
      forceFork: false,
      changes: options.changes,
    })
    .catch((e) => {
      throw new GitProviderError({
        status: e.response.data.status,
        message: e.response.data.message,
      });
    });

  return {
    status: 200,
  };
}
