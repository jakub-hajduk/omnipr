import { doesNotReject, equal, ok, rejects } from 'node:assert';
import { after, describe, it } from 'node:test';

import { type OmniPRError, errors } from '../shared/errors';
import type { GitProvider, PullRequest } from '../shared/types';

interface GitProviderConstructor<A> {
  new (): GitProvider<A>;
}

const getErrorMessage = <
  K extends keyof typeof errors,
  P extends Parameters<(typeof errors)[K]>,
>(
  key: K,
  ...args: P
) => {
  const errorGetter = errors[key];
  const error = errorGetter.apply({}, args);

  return error.message;
};

const checkError =
  <K extends keyof typeof errors, P extends Parameters<(typeof errors)[K]>>(
    key: K,
    ...args: P
  ) =>
  (error: OmniPRError) =>
    error.message === getErrorMessage(key, ...args);

const rand = () => Math.floor(Math.random() * 1000);

/**
 * Provider test helper that tests a GitProvider implementation.
 * It's not perfect, but it tests some things.
 *
 * @param ProviderConstructor - the constructor class.
 * @param auth - auth data for the provider.
 * @param master {String} - main branch name for the remote repository. (default: 'main')
 */
export async function testProvider<
  P extends GitProviderConstructor<any>,
  A extends Parameters<InstanceType<P>['setup']>[0],
>(ProviderConstructor: P, auth: A, master = 'main') {
  describe(ProviderConstructor.name, async () => {
    let providerInstance: GitProvider<any>;
    const seed = rand();
    const nonExistingBranch =
      'non-existing-branch-hgzOSd7YQUNNXA47NBxsww9o8SHltDDM';
    let counter = 0;
    const sourceBranchName = `source-branch-${seed}`;
    const targetBranchName = `target-branch-${seed}`;

    describe('Initialize', async () => {
      it('should instantiate provider', async () => {
        providerInstance = new ProviderConstructor();
      });

      it('should reject if no auth provided', async () => {
        await rejects(
          async () => {
            // @ts-expect-error - testing invalid data
            await providerInstance.setup();
          },
          (error: OmniPRError) => {
            return error.message === getErrorMessage('couldntSetupConnection');
          },
        );
      });

      it('should not reject if valid auth', async () => {
        await doesNotReject(async () => {
          await providerInstance.setup(auth);
        }, checkError('couldntSetupConnection'));
      });
    });

    describe('Branches', async () => {
      describe('createBranch', async () => {
        it('should reject if main branch does not exist', async () => {
          await rejects(
            async () => {
              await providerInstance.createBranch(
                nonExistingBranch,
                targetBranchName,
              );
            },
            checkError('branchDoesNotExist', nonExistingBranch),
          );
        });

        it('create target branch', async () => {
          await doesNotReject(
            async () => {
              await providerInstance.createBranch(master, targetBranchName);
            },
            checkError('branchAlreadyExists', targetBranchName),
          );
        });

        it('should return branch object', async () => {
          const sourceBranch = await providerInstance.createBranch(
            targetBranchName,
            sourceBranchName,
          );

          ok('name' in sourceBranch);
          ok('commit' in sourceBranch);
          ok('sha' in sourceBranch.commit);
        });
      });

      describe('getBranch', async () => {
        it('should not reject if branch exists', async () => {
          await doesNotReject(
            async () => {
              await providerInstance.getBranch(targetBranchName);
            },
            checkError('branchDoesNotExist', targetBranchName),
          );
        });

        it('should return branch obejct', async () => {
          const branch = await providerInstance.getBranch(targetBranchName);

          ok('name' in branch);
          ok('commit' in branch);
          ok('sha' in branch.commit);
        });
      });
    });

    describe('Commits', async () => {
      const pushedCommitMessages: string[] = [];

      describe('commitToBranch', async () => {
        let fileNameCounter = 0;
        const getFileName = () => `file-${++fileNameCounter}.txt`;
        const getFileContents = () => `file contents (${rand()})`;
        const getCommitMessage = () => `commit-${seed}-${++counter}`;

        it('should not reject', async () => {
          const fileName = getFileName();
          const fileContents = getFileContents();
          const commitMessage = getCommitMessage();
          const changes = { [fileName]: fileContents };

          await doesNotReject(
            async () => {
              await providerInstance.commitToBranch({
                branch: sourceBranchName,
                changes,
                commitMessage,
              });
            },
            checkError('couldntWriteFiles', sourceBranchName),
          );

          pushedCommitMessages.push(commitMessage);
        });

        it('should commit file to branch', async () => {
          const fileName = getFileName();
          const fileContents = getFileContents();
          const commitMessage = getCommitMessage();
          const changes = { [fileName]: fileContents };

          await providerInstance.commitToBranch({
            branch: sourceBranchName,
            changes,
            commitMessage,
          });

          const files = await providerInstance.getFromBranch({
            branch: sourceBranchName,
          });

          ok(files[fileName]);
          equal(files[fileName], fileContents);

          pushedCommitMessages.push(commitMessage);
        });

        it('should commit file in subdirectory to branch', async () => {
          const fileName = `some/nested/path/${getFileName()}`;
          const fileContents = getFileContents();
          const commitMessage = getCommitMessage();
          const changes = { [fileName]: fileContents };

          await providerInstance.commitToBranch({
            branch: sourceBranchName,
            changes,
            commitMessage,
          });

          const files = await providerInstance.getFromBranch({
            branch: sourceBranchName,
          });

          ok(files[fileName]);
          equal(files[fileName], fileContents);

          pushedCommitMessages.push(commitMessage);
        });

        it('should commit file in specific path to branch', async () => {
          const fileName = getFileName();
          const fileContents = getFileContents();
          const commitMessage = getCommitMessage();
          const changes = { [fileName]: fileContents };

          await providerInstance.commitToBranch({
            branch: sourceBranchName,
            changes,
            commitMessage,
            path: 'other/nested/path',
          });

          const files = await providerInstance.getFromBranch({
            branch: sourceBranchName,
          });

          ok(files[`other/nested/path/${fileName}`]);
          equal(files[`other/nested/path/${fileName}`], fileContents);

          pushedCommitMessages.push(commitMessage);
        });

        it('should return commit object', async () => {
          const commitMessage = getCommitMessage();
          const fileName = getFileName();
          const fileContents = getFileContents();
          const changes = {
            [fileName]: fileContents,
          };

          const commit = await providerInstance.commitToBranch({
            branch: sourceBranchName,
            changes,
            commitMessage,
          });

          ok('sha' in commit);
          ok('message' in commit);
          ok('author' in commit);
          ok('email' in commit.author);
          ok('name' in commit.author);
          ok('date' in commit);

          pushedCommitMessages.push(commitMessage);
        });
      });

      describe('getCommits', async () => {
        it('should get list of commits and contain all commited messages', async () => {
          const commits = await providerInstance.getCommits(sourceBranchName);

          ok(commits.length >= pushedCommitMessages.length);
          ok(Array.isArray(commits));

          for (const message of pushedCommitMessages) {
            ok(commits.find((c) => c.message === message));
          }
        });
      });
    });

    describe('Pull requests', async () => {
      let prCounter = 0;
      const getPullRequestTitle = () => `pull-request-${seed}-${++prCounter}`;

      describe('createPullRequest', async () => {
        it('should notReject, create pull request and return the PullRequest object.', async () => {
          const pullRequestTitle = getPullRequestTitle();
          let pullRequest: PullRequest;

          await doesNotReject(
            async () => {
              pullRequest = await providerInstance.createPullRequest({
                sourceBranch: sourceBranchName,
                targetBranch: targetBranchName,
                title: pullRequestTitle,
                description: 'Test',
              });
            },
            checkError(
              'couldntCreatePullRequest',
              sourceBranchName,
              targetBranchName,
            ),
          );

          ok('title' in pullRequest);
          ok('description' in pullRequest);
          ok('sourceBranch' in pullRequest);
          ok('targetBranch' in pullRequest);
          ok('id' in pullRequest);
          ok('link' in pullRequest);
        });
      });

      describe('getPullRequests', async () => {
        it('should return array of PullRequest objects.', async () => {
          const pullRequests = await providerInstance.getPullRequests();

          ok(Array.isArray(pullRequests));
          ok(pullRequests.length > 0);

          const singlePullRequest = pullRequests[0];

          ok('title' in singlePullRequest);
          ok('description' in singlePullRequest);
          ok('sourceBranch' in singlePullRequest);
          ok('targetBranch' in singlePullRequest);
          ok('id' in singlePullRequest);
          ok('link' in singlePullRequest);
        });
      });
    });

    after(() => {
      providerInstance.deleteBranch(sourceBranchName);
      providerInstance.deleteBranch(targetBranchName);
    });
  });
}
