import type { Schema } from 'bitbucket';
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

type GetBranchData = Schema.Branch;

type TreeEntries = Schema.PaginatedTreeentries;

export interface BitbucketAuthOptions {
  token: string;
  url: string;
}

class BitbucketProvider implements GitProvider<BitbucketAuthOptions> {
  private httpClient: KyInstance;
  private sourceBranch: GetBranchData;
  private targetBranch: GetBranchData;
  private auth: BitbucketAuthOptions;

  async setup(auth: BitbucketAuthOptions) {
    this.auth = auth;
    const repoUrl = new URL(this.auth.url);
    const [workspace, slug] = repoUrl.pathname.split('/').splice(1);

    this.httpClient = httpClient.extend({
      prefixUrl: `https://api.bitbucket.org/2.0/repositories/${workspace}/${slug}`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.auth.token}`,
      },
    });

    return true;
  }

  private async getBranch(branch: string): Promise<GetBranchData> {
    try {
      return await this.httpClient
        .get<GetBranchData>(`refs/branches/${branch}`)
        .json();
    } catch {
      return;
    }
  }

  private async deleteSourceBranch(sourceBranch: string) {
    try {
      await this.httpClient.delete(`refs/branches/${sourceBranch}`).json();
      this.sourceBranch = undefined;
      return true;
    } catch (e) {
      return false;
    }
  }

  private async createSourceBranch(sourceBranch: string): Promise<boolean> {
    try {
      await this.httpClient
        .post('refs/branches', {
          json: {
            name: sourceBranch,
            target: {
              hash: this.targetBranch.target.hash,
            },
          },
        })
        .json();
      return true;
    } catch (e) {
      return false;
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
    let path = '';
    let filesToPick = options?.files;

    if (options?.path) {
      path = normalizePath(options.path);
      filesToPick = options?.files?.map((file) => [path, file].join('/'));
    }

    const fileList = await this.httpClient
      .get<TreeEntries>(`src/${this.sourceBranch.name}/${path}`, {
        searchParams: {
          pagelen: 100,
          max_depth: 10,
        },
      })
      .json();

    let pickedFiles = fileList?.values?.filter((entry) => {
      return entry.type === 'commit_file';
    });

    if (Array.isArray(filesToPick) && filesToPick.length > 0) {
      pickedFiles = pickedFiles.filter((entry) =>
        filesToPick.includes(entry.path),
      );
    }

    const out = await Promise.all(
      pickedFiles.map(async (entry) => {
        const path = entry.path;
        const content = await this.httpClient
          .get(`src/${this.sourceBranch.name}/${path}`)
          .text();

        return [path, content];
      }),
    );

    return Object.fromEntries(out);
  }

  public async writeChanges(options: WriteChangesOptions): Promise<boolean> {
    const existingFiles = await this.getFilesFromSourceBranch({
      path: options?.path,
      files: Object.keys(options.changes),
    });

    const data = new FormData();

    for (const [file, content] of Object.entries(options?.changes)) {
      let fileContent = content;

      if (typeof content === 'function') {
        fileContent = content({
          path: file,
          exists: !!existingFiles[file],
          contents: existingFiles[file],
        });
      }

      if (fileContent === null) {
        data.append('files', file);
        continue;
      }

      data.append(file, String(fileContent));
    }

    data.append('message', options.commitMessage);
    data.append('branch', this.sourceBranch.name);

    try {
      const f = await this.httpClient
        .post('src', {
          body: data,
        })
        .json();
      return true;
    } catch {
      return false;
    }
  }

  async createPullRequest(options: PullRequestOptions): Promise<boolean> {
    try {
      await this.httpClient.post('pullrequests', {
        json: {
          title: options.title,
          description: options.description,
          source: {
            branch: {
              name: this.sourceBranch.name,
            },
          },
          destination: {
            branch: {
              name: this.targetBranch.name,
            },
          },
        },
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const bitbucket = new BitbucketProvider();
