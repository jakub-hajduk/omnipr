import type {
  BranchSchema,
  RepositoryTreeSchema,
  SimpleProjectSchema,
} from '@gitbeaker/rest';
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

export interface GitlabProviderAuthOptions {
  token: string;
  url: string;
}

const encodeURL = (path: string) => {
  return encodeURIComponent(path).replaceAll('.', '%2E');
};

class GitlabProvider implements GitProvider<GitlabProviderAuthOptions> {
  private httpClient: KyInstance;
  private sourceBranch: BranchSchema;
  private targetBranch: BranchSchema;
  private auth: GitlabProviderAuthOptions;
  private project: SimpleProjectSchema;

  async setup(auth: GitlabProviderAuthOptions) {
    try {
      this.auth = auth;
      const repoUrl = new URL(this.auth.url);
      const [_user, projectName] = repoUrl.pathname.split('/').splice(1);

      this.httpClient = httpClient.extend({
        prefixUrl: `${repoUrl.origin}/api/v4`,
        headers: {
          Authorization: `Bearer ${this.auth.token}`,
        },
      });

      const projects = await this.httpClient
        .get<SimpleProjectSchema[]>('projects', {
          searchParams: {
            membership: true,
            simple: true,
            search: projectName,
          },
        })
        .json();

      this.project = projects.find((project) => project.name === projectName);

      this.httpClient = httpClient.extend({
        prefixUrl: `${repoUrl.origin}/api/v4/projects/${this.project.id}`,
        headers: {
          Authorization: `Bearer ${this.auth.token}`,
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  private async getBranch(branch: string): Promise<BranchSchema> {
    try {
      return await this.httpClient
        .get<BranchSchema>(`repository/branches/${branch}`)
        .json();
    } catch {
      return;
    }
  }

  private async deleteSourceBranch(sourceBranch: string) {
    try {
      await this.httpClient
        .delete(`repository/branches/${sourceBranch}`)
        .json();
      return true;
    } catch (e) {
      return false;
    }
  }

  private async createSourceBranch(
    sourceBranch: string,
  ): Promise<BranchSchema> {
    try {
      return await this.httpClient
        .post('repository/branches', {
          searchParams: {
            branch: sourceBranch,
            ref: this.targetBranch.name,
          },
        })
        .json();
    } catch (e) {
      return;
    }
  }

  public async prepareBranches(options: BranchesOptions) {
    try {
      this.targetBranch = await this.getBranch(options.targetBranch);

      const sourceBranch = await this.getBranch(options.sourceBranch);

      if (sourceBranch && options.resetSourceBranchIfExists) {
        await this.deleteSourceBranch(options.sourceBranch);
        this.sourceBranch = await this.createSourceBranch(options.sourceBranch);
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

    const tree = await this.httpClient
      .get<RepositoryTreeSchema[]>('repository/tree', {
        searchParams: {
          path: path,
          ref: this.sourceBranch.name,
          recursive: true,
        },
      })
      .json();

    let pickedFiles = tree?.filter((entry) => {
      return entry.type === 'blob';
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
          .get(`repository/files/${encodeURL(path)}/raw`, {
            searchParams: {
              ref: this.sourceBranch.name,
            },
          })
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

    const actions = [];

    for (const [file, content] of Object.entries(options?.changes)) {
      let fileContent = content;

      if (typeof content === 'function') {
        fileContent = content({
          path: file,
          exists: !!existingFiles[file],
          contents: existingFiles[file],
        });
      }

      let action = 'update';

      if (fileContent === null) {
        action = 'delete';
      } else if (!existingFiles[file]) {
        action = 'create';
      }

      actions.push({
        action,
        file_path: file,
        content: fileContent,
      });
    }

    try {
      await this.httpClient
        .post('repository/commits', {
          json: {
            branch: this.sourceBranch.name,
            commit_message: options.commitMessage,
            actions,
          },
        })
        .json();
    } catch {
      return false;
    }
  }

  async createPullRequest(options: PullRequestOptions): Promise<boolean> {
    try {
      await this.httpClient
        .post('merge_requests', {
          json: {
            source_branch: this.sourceBranch.name,
            target_branch: this.targetBranch.name,
            title: options.title,
            description: options.description,
            allow_collaboration: true,
          },
        })
        .json();
    } catch (e) {
      const responseJson = await e.response.json();
      const message = responseJson.message[0].split(': !');
      const mrNumber = message[1];
      await this.httpClient
        .put(`merge_requests/${mrNumber}`, {
          json: {
            source_branch: this.sourceBranch.name,
            target_branch: this.targetBranch.name,
            title: options.title,
            description: options.description,
            allow_collaboration: true,
          },
        })
        .json();
    }

    return true;
  }
}

export const gitlab = new GitlabProvider();
