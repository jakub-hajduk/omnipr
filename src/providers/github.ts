import type { Endpoints } from '@octokit/types';
import type { HTTPError, KyInstance } from 'ky';
import { errors } from '../shared/errors';
import { extractErrorMessage } from '../shared/extract-error-message';
import { httpClient } from '../shared/request';
import {
  type Branch,
  type Commit,
  type CommitOptions,
  type Files,
  type GetFileOptions,
  type GetFilesOptions,
  type GitProvider,
  type PullRequest,
  type PullRequestOptions,
  isBranch,
} from '../shared/types';

type EndpointData<E extends keyof Endpoints> = Endpoints[E]['response']['data'];
type GetBranchData =
  EndpointData<'GET /repos/{owner}/{repo}/branches/{branch}'>;
type CreateBranchData = EndpointData<'POST /repos/{owner}/{repo}/git/refs'>;
type DeleteBranchData =
  EndpointData<'DELETE /repos/{owner}/{repo}/git/refs/{ref}'>;
type TreeData = EndpointData<'GET /repos/{owner}/{repo}/git/trees/{tree_sha}'>;
type PostTreeData = EndpointData<'POST /repos/{owner}/{repo}/git/trees'>;
type GetContentsData =
  EndpointData<'GET /repos/{owner}/{repo}/contents/{path}'>;
type PostCommitData = EndpointData<'POST /repos/{owner}/{repo}/git/commits'>;
type GetPullRequestData = EndpointData<'GET /repos/{owner}/{repo}/pulls'>;
type PostPullRequestData = EndpointData<'POST /repos/{owner}/{repo}/pulls'>;
type GetBranchesData = EndpointData<'GET /repos/{owner}/{repo}/branches'>;
type GetCommitsData = EndpointData<'GET /repos/{owner}/{repo}/commits'>;

export interface GithubProviderOptions {
  token: string;
  url: string;
}

export class GithubProvider implements GitProvider<GithubProviderOptions> {
  private httpClient: KyInstance;

  async setup(auth: GithubProviderOptions) {
    if (!auth) throw errors.couldntSetupConnection('Missing auth object.');
    if (!auth.url)
      throw errors.couldntSetupConnection('Missing repository url.');
    if (!auth.token) throw errors.couldntSetupConnection('Missing token.');
    const repoUrl = new URL(auth.url);
    const [owner, repo] = repoUrl.pathname.split('/').splice(1);

    this.httpClient = httpClient.extend({
      prefixUrl: `https://api.github.com/repos/${owner}/${repo}`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${auth.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      hooks: {
        beforeError: [
          await extractErrorMessage((err) => `${err.status} - ${err.message}`),
        ],
      },
    });
  }

  // Branch already exists
  public async createBranch(from: string, name: string): Promise<Branch>;
  public async createBranch(fromBranch: Branch, name: string): Promise<Branch>;
  public async createBranch(
    from: string | Branch,
    name: string,
  ): Promise<Branch> {
    let fromBranch = from as Branch;

    if (typeof from === 'string') {
      fromBranch = await this.getBranch(from);
    }

    return await this.httpClient
      .post<CreateBranchData>('git/refs', {
        json: {
          sha: fromBranch.commit.sha,
          ref: `refs/heads/${name}`,
        },
      })
      .json()
      .catch((details: HTTPError) => {
        throw errors.branchAlreadyExists(name, details.message);
      })
      .then((response) => ({
        name,
        commit: {
          sha: response.object.sha,
        },
      }));
  }

  // Branch does not exist
  public async getBranch(name: string): Promise<Branch> {
    return await this.httpClient
      .get<GetBranchData>(`branches/${name}`)
      .json()
      .catch((details: HTTPError) => {
        throw errors.branchDoesNotExist(name, details.message);
      })
      .then((response) => ({
        name: response.name,
        commit: {
          sha: response.commit.sha,
        },
      }));
  }

  // Branch does not exist
  public async deleteBranch(name: string): Promise<void>;
  public async deleteBranch(branch: Branch): Promise<void>;
  public async deleteBranch(nameOrBranch: string | Branch): Promise<void> {
    let branch = nameOrBranch as string;

    if (isBranch(nameOrBranch)) {
      branch = nameOrBranch.name;
    }

    await this.httpClient
      .delete<DeleteBranchData>(`git/refs/heads/${branch}`)
      .json()
      .catch((details: HTTPError) => {
        throw errors.branchDoesNotExist(branch, details.message);
      });
  }

  private async getSha(branch: Branch, path: string) {
    if (path === '') {
      return branch.commit.sha;
    }

    const parent = path.includes('/')
      ? path.split('/').slice(0, -1).join('/')
      : '';

    try {
      const contents = await this.httpClient
        .get<GetContentsData>(`contents/${parent}`, {
          searchParams: {
            ref: branch.name,
          },
        })
        .json();

      if (Array.isArray(contents)) {
        const directory = contents.find(
          (item) => item.type === 'dir' && item.path === path,
        );
        return directory.sha;
      }

      if (contents.path === path) {
        return contents.sha;
      }
    } catch {
      return branch.commit.sha;
    }
  }

  public async commitToBranch(options: CommitOptions): Promise<Commit> {
    const files = options.changes;
    const branch = await this.getBranch(options.branch);
    let sha = branch.commit.sha;

    if (options.path) {
      sha = await this.getSha(branch, options.path);
    }

    const createNewTreeResponse = await this.httpClient
      .post<PostTreeData>('git/trees', {
        json: {
          base_tree: sha,
          tree: Object.entries(files).map(([file, contents]) => {
            const filePath = options.path ? `${options.path}/${file}` : file;

            if (contents === null) {
              // If contents is null, remove file.
              return {
                path: filePath,
                sha: null,
                mode: '100644',
                type: 'blob',
              };
            }

            return {
              path: filePath,
              content: contents,
              mode: '100644',
              type: 'blob',
            };
          }),
        },
      })
      .json()
      .catch((e) => {
        throw errors.couldntWriteFiles(branch.name, e.message);
      });

    const createNewCommitResponse = await this.httpClient
      .post<PostCommitData>('git/commits', {
        json: {
          message: options.commitMessage,
          tree: createNewTreeResponse.sha,
          parents: [branch.commit.sha],
        },
      })
      .json()
      .catch((e) => {
        throw errors.couldntWriteFiles(branch.name, e.message);
      });

    await this.httpClient
      .post(`git/refs/heads/${branch.name}`, {
        json: {
          sha: createNewCommitResponse.sha,
        },
      })
      .catch((e) => {
        throw errors.couldntWriteFiles(branch.name, e.message);
      });

    return {
      message: createNewCommitResponse.message,
      sha: createNewCommitResponse.sha,
      author: {
        name: createNewCommitResponse.author.name,
        email: createNewCommitResponse.author.email,
      },
      date: createNewCommitResponse.author.date,
    };
  }

  public async getFileContents(options: GetFileOptions): Promise<string> {
    const branch = await this.getBranch(options.branch);
    const filePath = options.path
      ? `${options.path}/${options.file}`
      : options.file;

    return this.httpClient
      .get<GetContentsData>(`contents/${filePath}`, {
        searchParams: {
          ref: branch.name,
        },
        headers: {
          Accept: 'application/vnd.github.raw',
        },
      })
      .text()
      .catch((e) => {
        throw errors.couldntReadFileContents(branch.name, filePath, e.message);
      });
  }

  public async getFromBranch(options?: GetFilesOptions): Promise<Files> {
    const branch = await this.getBranch(options.branch);
    let sha = branch.commit.sha;

    if (options.path) {
      sha = await this.getSha(branch, options.path);
    }

    const treeData = await this.httpClient
      .get<TreeData>(`git/trees/${sha}`, {
        searchParams: {
          recursive: 'true',
        },
      })
      .json()
      .catch((e) => {
        throw errors.couldntReadFiles(options.branch, e.message);
      });

    // Filter only the files, not the directories
    const filesOnly = treeData.tree.filter((entry) => entry.type === 'blob');

    // Get the contents of the files
    const fileContents = await Promise.all(
      filesOnly.map((file) =>
        this.getFileContents({
          branch: options.branch,
          file: file.path,
          path: options.path,
        }),
      ),
    );

    const files: [string, string][] = [];

    for (let index = 0; index < filesOnly.length; index++) {
      const file = filesOnly[index].path;
      const contents = fileContents[index];
      files.push([file, contents]);
    }

    return Object.fromEntries(files);
  }

  public async createPullRequest(
    options: PullRequestOptions,
  ): Promise<PullRequest> {
    return await this.httpClient
      .post<PostPullRequestData>('pulls', {
        json: {
          title: options.title,
          body: options.description,
          base: options.targetBranch,
          head: options.sourceBranch,
          maintainer_can_modify: true,
        },
      })
      .json()
      .then((resp) => {
        return {
          title: resp.title,
          description: resp.body,
          sourceBranch: resp.head.ref,
          targetBranch: resp.base.ref,
          id: String(resp.number),
          link: resp.html_url,
        };
      })
      .catch(async (e) => {
        const pullRequests = await this.httpClient
          .get<GetPullRequestData>('pulls', {
            searchParams: {
              head: options.sourceBranch,
              base: options.targetBranch,
              per_page: 100,
            },
          })
          .json()
          .catch(() => {
            throw errors.couldntCreatePullRequest(
              options.sourceBranch,
              options.targetBranch,
              e.message,
            );
          });

        const pullRequest = pullRequests.find(
          (pr) => pr.base.ref === options.targetBranch && pr.head.ref,
        );

        return {
          title: pullRequest.title,
          description: pullRequest.body,
          sourceBranch: pullRequest.head.ref,
          targetBranch: pullRequest.base.ref,
          id: String(pullRequest.number),
          link: pullRequest.html_url,
        };
      });
  }

  public async getBranches(): Promise<Branch[]> {
    const branches = await this.httpClient
      .get<GetBranchesData>('branches', {
        searchParams: {
          per_page: 100,
        },
      })
      .json()
      .catch((e) => {
        throw errors.temporary(`Couldn't get branches`, e.message);
      });

    return branches.map((branch) => ({
      name: branch.name,
      commit: { sha: branch.commit.sha },
    }));
  }

  public async getPullRequests(): Promise<PullRequest[]> {
    const pullRequests = await this.httpClient
      .get<GetPullRequestData>('pulls', {
        searchParams: {
          per_page: 100,
        },
      })
      .json();

    return pullRequests.map((pr) => ({
      title: pr.title,
      description: pr.body,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      id: String(pr.number),
      link: pr.html_url,
    }));
  }

  public async getCommits(branch: string): Promise<Commit[]> {
    const commits = await this.httpClient
      .get<GetCommitsData>('commits', {
        searchParams: {
          sha: branch,
          per_page: 100,
        },
      })
      .json()
      .catch((e) => {
        throw errors.temporary('Could not get commits', e.message);
      });

    return commits.map((commit) => ({
      message: commit.commit.message,
      sha: commit.sha,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
      },
      date: commit.commit.author.date,
    }));
  }
}
