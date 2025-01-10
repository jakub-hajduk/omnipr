import { Bitbucket } from 'bitbucket';
import type { Schema } from 'bitbucket';
import { GitProviderError } from '../shared/git-provider-error';
import type {
  GitProviderPullRequestOptions,
  GitProviderReturnType,
} from '../shared/types';

export async function bitbucket(
  options: GitProviderPullRequestOptions,
): Promise<GitProviderReturnType> {
  const repoUrl = new URL(options.url);
  const [owner, repo] = repoUrl.pathname.split('/').splice(1);

  const bitbucket = new Bitbucket({
    auth: {
      token: options.token,
    },
  });

  let branch: Schema.Branch;

  try {
    try {
      branch = await bitbucket.refs
        .getBranch({
          workspace: owner,
          repo_slug: repo,
          name: options.branches.source,
        })
        .then((branch) => branch.data);
    } catch {
      const targetHash = await bitbucket.repositories
        .listRefs({
          workspace: owner,
          repo_slug: repo,
        })
        .then((response) => {
          const branch = response.data.values.find(
            (branch) => branch.name === options.branches.target,
          );
          if (!branch)
            throw new Error(`Missing ${options.branches.target} branch`);
          return branch.target.hash;
        });

      branch = await bitbucket.refs
        .createBranch({
          workspace: owner,
          repo_slug: repo,
          _body: {
            name: options.branches.source,
            target: {
              hash: targetHash,
            },
          },
        })
        .then((branch) => branch.data);
    }
  } catch (e) {
    throw new GitProviderError({
      status: e.status,
      message: e.error.error.message,
    });
  }

  if (!branch) return;

  for (const changeset of options.changes) {
    const data = new FormData();

    for (const [file, content] of Object.entries(changeset.files)) {
      data.append(file, content);
    }

    data.append('message', changeset.commit);
    data.append('branch', branch.name);

    const url = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/src`;
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.token}`,
        },
        body: data,
      });
    } catch (e) {
      throw new GitProviderError({
        status: e.status,
        message: e.error.error.message,
      });
    }
  }

  try {
    bitbucket.repositories.createPullRequest({
      workspace: owner,
      repo_slug: repo,
      _body: {
        type: 'PR',
        description: options.description,
        title: options.title,
        destination: {
          branch: {
            name: options.branches.target,
          },
        },
        source: {
          branch: {
            name: options.branches.source,
          },
        },
      },
    });
  } catch (e) {
    throw new GitProviderError({
      status: e.status,
      message: e.error.error.message,
    });
  }

  return {
    status: 200,
  };
}
