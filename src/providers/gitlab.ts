import {
  type BranchSchema,
  type CommitAction,
  Gitlab,
  type SimpleProjectSchema,
} from '@gitbeaker/rest';
import { GitProviderError } from '../shared/git-provider-error';
import type { GitProviderPullRequestOptions } from '../shared/types';

export async function gitlab(options: GitProviderPullRequestOptions) {
  const repoUrl = new URL(options.url);
  const [_user, repo] = repoUrl.pathname.split('/').splice(1);

  const gitlab = new Gitlab({
    token: options.token,
    host: repoUrl.origin,
  });

  let project: SimpleProjectSchema;
  let branch: BranchSchema;

  // Get project info
  const projects = await gitlab.Projects.all({
    membership: true,
    search: repo,
    simple: true,
  }).catch((c) => {
    throw new GitProviderError({
      status: c.cause.response.status,
      message: c.cause.response.statusText,
    });
  });

  if (!projects.length) return;

  project = projects.find((project) => project.name === repo);

  // Get or create branch
  try {
    branch = await gitlab.Branches.show(
      project.id,
      options.branches.source,
    ).catch((c) => {
      throw new GitProviderError({
        status: c.cause.response.status,
        message: c.cause.response.statusText,
      });
    });
  } catch {
    if (!branch) {
      branch = await gitlab.Branches.create(
        project.id,
        options.branches.source,
        `heads/${options.branches.target}`,
      ).catch((c) => {
        throw new GitProviderError({
          status: c.cause.response.status,
          message: c.cause.response.statusText,
        });
      });
    }
  }

  if (!branch) return;

  // Write changesets
  const tree = await gitlab.Repositories.allRepositoryTrees(project.id, {
    ref: branch.name,
    recursive: true,
  }).catch((c) => {
    throw new GitProviderError({
      status: c.cause.response.status,
      message: c.cause.response.statusText,
    });
  });

  const files = tree
    .filter((object) => object.type === 'blob')
    .map((file) => file.path);

  let succeedWrites = 0;
  for await (const changeset of options.changes) {
    const filesToWrite: CommitAction[] = Object.entries(changeset.files).map(
      ([file, content]) => ({
        action: files.includes(file) ? 'update' : 'create',
        filePath: file,
        content,
      }),
    );

    try {
      await gitlab.Commits.create(
        project.id,
        branch.name,
        changeset.commit,
        filesToWrite,
      ).catch((c) => {
        throw new GitProviderError({
          status: c.cause.response.status,
          message: c.cause.response.statusText,
        });
      });

      succeedWrites++;
    } catch (e: any) {
      throw new Error(e.cause.description);
    }
  }

  if (succeedWrites !== options.changes.length) return;

  await gitlab.MergeRequests.create(
    project.id,
    options.branches.source,
    options.branches.target,
    options.title,
    {
      description: options.description,
    },
  ).catch((c) => {
    throw new GitProviderError({
      status: c.cause.response.status,
      message: c.cause.response.statusText,
    });
  });

  return {
    status: 200,
  };
}
