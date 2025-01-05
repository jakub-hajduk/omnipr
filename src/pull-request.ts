import type {
  Change,
  GitProvider,
  GitProviderReturnType,
  PullRequestOptions,
} from './shared/types';

export async function pullRequest(
  provider: GitProvider,
  options: PullRequestOptions,
  files: Record<string, string>,
): Promise<GitProviderReturnType> {
  const changes: Change[] = [
    {
      files,
      commit: options.commit,
    },
  ];

  if (options.path) {
    if (options.path.endsWith('/')) {
      options.path = options.path.replace(/\/+$/, '');
    }

    for (const change of changes) {
      change.files = Object.fromEntries(
        Object.entries(change.files).map(([file, contents]) => [
          `${options.path}/${file}`,
          contents,
        ]),
      );
    }
  }

  try {
    return await provider({
      ...options,
      changes,
    });
  } catch (e) {
    return e.error;
  }
}
