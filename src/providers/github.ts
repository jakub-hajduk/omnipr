import type { Endpoints } from '@octokit/types';
import type { KyInstance } from 'ky';
import { normalizePath } from '../shared/normalize-path';
import { httpClient } from '../shared/request';
import type {
  BranchesOptions,
  GitProvider,
  PullRequestOptions,
  ReadFilesOptions,
  WriteChangesOptions,
} from '../shared/types';

type GetBranchEndpoint =
  Endpoints['GET /repos/{owner}/{repo}/branches/{branch}'];
type GetBranchData = GetBranchEndpoint['response']['data'];

type GetTreeEndpoint =
  Endpoints['GET /repos/{owner}/{repo}/git/trees/{tree_sha}'];
type TreeData = GetTreeEndpoint['response']['data'];
type TreeDataEntry = TreeData['tree'][number];

type PostTreeEndpoint = Endpoints['POST /repos/{owner}/{repo}/git/trees'];
type PostTreeData = PostTreeEndpoint['response']['data'];

type GetContentsEndpoint =
  Endpoints['GET /repos/{owner}/{repo}/contents/{path}'];
type ContentsData = GetContentsEndpoint['response']['data'];

type PostCommitsEndpoint = Endpoints['POST /repos/{owner}/{repo}/git/commits'];
type PostCommitData = PostCommitsEndpoint['response']['data'];

type ExistingFile = TreeDataEntry & { contents: string };

export interface GithubProviderOptions {
  token: string;
  url: string;
}

class GithubProvider implements GitProvider<GithubProviderOptions> {
  private httpClient: KyInstance;
  private sourceBranch: GetBranchData;
  private targetBranch: GetBranchData;
  private auth: GithubProviderOptions;

  async setup(auth: GithubProviderOptions) {
    this.auth = auth;
    const repoUrl = new URL(this.auth.url);
    const [owner, repo] = repoUrl.pathname.split('/').splice(1);

    this.httpClient = httpClient.extend({
      prefixUrl: `https://api.github.com/repos/${owner}/${repo}`,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.auth.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    return true;
  }

  private async getBranch(branch: string): Promise<GetBranchData> {
    try {
      return await this.httpClient
        .get<GetBranchData>(`branches/${branch}`)
        .json();
    } catch {
      return;
    }
  }

  private async deleteSourceBranch(sourceBranch: string) {
    try {
      await this.httpClient.delete(`git/refs/heads/${sourceBranch}`).json();
      return true;
    } catch (e) {
      return false;
    }
  }

  private async createSourceBranch(sourceBranch: string): Promise<boolean> {
    try {
      await this.httpClient
        .post('git/refs', {
          json: {
            sha: this.targetBranch.commit.sha,
            ref: `refs/heads/${sourceBranch}`,
          },
        })
        .json();
      return true;
    } catch (e) {
      return false;
    }
  }

  private async getSha(path: string) {
    if (path === '') {
      return this.sourceBranch.commit.commit.tree.sha;
    }

    const parent = path.includes('/')
      ? path.split('/').slice(0, -1).join('/')
      : '';

    const contents = await this.httpClient
      .get<ContentsData>(`contents/${parent}`, {
        searchParams: {
          ref: this.sourceBranch.name,
        },
      })
      .json();

    if (Array.isArray(contents)) {
      const directory = contents.find((item) => item.path === path);
      return directory.sha;
    }

    if (contents.path === path) {
      return contents.sha;
    }
  }

  public async prepareBranches(options: BranchesOptions) {
    try {
      this.targetBranch = await this.getBranch(options.targetBranch);

      const sourceBranch = await this.getBranch(options.sourceBranch);

      if (sourceBranch && options.resetSourceBranchIfExists) {
        await this.deleteSourceBranch(options.sourceBranch);
        await this.createSourceBranch(options.sourceBranch);
        this.sourceBranch = await this.getBranch(options.sourceBranch);
        return true;
      }

      this.sourceBranch = sourceBranch;
      if (sourceBranch) return true;

      await this.createSourceBranch(options.sourceBranch);
      this.sourceBranch = await this.getBranch(options.sourceBranch);
      return true;
    } catch {
      return false;
    }
  }

  public async getFilesFromSourceBranch(
    options?: ReadFilesOptions,
  ): Promise<Record<string, string>> {
    const sha = await this.getSha(normalizePath(options?.path || ''));

    const treeData = await this.httpClient
      .get<TreeData>(`git/trees/${sha}`, {
        searchParams: {
          recursive: 'true',
        },
      })
      .json();

    let treeContentsBlobs = treeData.tree.filter(
      (entry) => entry.type === 'blob',
    );

    if (Array.isArray(options?.files) && options.files.length > 0) {
      treeContentsBlobs = treeContentsBlobs.filter((entry) =>
        options.files.includes(entry.path),
      );
    }

    const fileContents = await Promise.all(
      treeContentsBlobs.map((file) => {
        return this.httpClient
          .get(`contents/${[options?.path, file.path].join('/')}`, {
            searchParams: {
              ref: this.sourceBranch.name,
            },
            headers: {
              Accept: 'application/vnd.github.raw',
            },
          })
          .text();
      }),
    );

    const existingFiles: Record<string, ExistingFile> = {};

    for (let index = 0; index < treeContentsBlobs.length; index++) {
      const treeEntry = treeContentsBlobs[index];
      const contents = fileContents[index];
      existingFiles[treeEntry.path] = {
        ...treeEntry,
        contents,
      };
    }

    return Object.fromEntries(
      Object.values(existingFiles).map(({ path, contents }) => [
        path,
        contents,
      ]),
    );
  }

  public async writeChanges(options: WriteChangesOptions): Promise<boolean> {
    const treeSha = await this.getSha(options.path || '');
    const existingFiles = await this.getFilesFromSourceBranch({
      path: options.path,
    });
    const files = options.changes;

    try {
      const createNewTreeResponse = await this.httpClient
        .post<PostTreeData>('git/trees', {
          json: {
            base_tree: treeSha,
            tree: Object.entries(files).map(([file, contents]) => {
              let fileContents = contents;

              if (typeof contents === 'function') {
                fileContents = contents({
                  exists: !!existingFiles[file],
                  contents: existingFiles[file],
                  path: file,
                });
              }

              if (fileContents === null) {
                // If contents is null, remove file.
                return {
                  path: file,
                  sha: null,
                  mode: '100644',
                  type: 'blob',
                };
              }

              return {
                path: file,
                content: fileContents,
                mode: '100644',
                type: 'blob',
              };
            }),
          },
        })
        .json();

      const createNewCommitResponse = await this.httpClient
        .post<PostCommitData>('git/commits', {
          json: {
            message: options.commitMessage,
            tree: createNewTreeResponse.sha,
            parents: [this.sourceBranch.commit.sha],
          },
        })
        .json();

      await this.httpClient.post(`git/refs/heads/${this.sourceBranch.name}`, {
        json: {
          sha: createNewCommitResponse.sha,
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  async createPullRequest(options: PullRequestOptions): Promise<boolean> {
    await this.httpClient
      .post('pulls', {
        json: {
          title: options.title,
          body: options.description,
          base: this.targetBranch.name,
          head: this.sourceBranch.name,
          maintainer_can_modify: true,
        },
      })
      .json();
    return true;
  }
}

export const github = new GithubProvider();
