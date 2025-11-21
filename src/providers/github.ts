import { parseUrl } from '../shared/parse-url';
import { normalizeDirectoryPath } from '../shared/path-utils';
import type { Provider } from '../shared/types';

interface GithubProviderConfig {
  token: string;
  url: string;
}

export class GithubProvider implements Provider {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;
  private readonly owner: string;
  public fetch: typeof fetch = globalThis.fetch;

  constructor(config: GithubProviderConfig) {
    const { path } = parseUrl(config.url);

    const [owner, repo] = path.replace(/^\/|\/$/g, '').split('/');

    this.owner = owner;
    this.baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object,
    customHeaders?: HeadersInit,
  ): Promise<T> {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { ...this.headers, ...customHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    if (response.status === 204) {
      return undefined as T; // No content for 204
    }

    return response.json() as Promise<T>;
  }

  async getBranchSha(branchName: string): Promise<string | undefined> {
    try {
      const data = await this.request<{ commit: { sha: string } }>(
        'GET',
        `/branches/${branchName}`,
      );
      return data.commit.sha;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404 Not Found')) {
        return undefined;
      }
      throw error;
    }
  }

  async createBranch(branchName: string, sha: string): Promise<void> {
    await this.request('POST', '/git/refs', {
      ref: `refs/heads/${branchName}`,
      sha: sha,
    });
  }

  async deleteBranch(branchName: string): Promise<void> {
    await this.request('DELETE', `/git/refs/heads/${branchName}`);
  }

  async getFileContent(
    branchName: string,
    filePath: string,
  ): Promise<string | undefined> {
    const response = await fetch(
      `${this.baseUrl}/contents/${filePath}?ref=${branchName}`,
      {
        headers: {
          ...this.headers,
          Accept: 'application/vnd.github.raw', // To get raw content
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return undefined;
      }
      const errorBody = await response.text();
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }
    return response.text();
  }

  async pull(
    branchName: string,
    path = './',
    recursive = false,
  ): Promise<Record<string, string>> {
    try {
      const branchInfo = await this.request<{
        commit: { commit: { tree: { sha: string } } };
      }>('GET', `/branches/${branchName}`);
      const rootTreeSha = branchInfo.commit.commit.tree.sha;

      const treeData = await this.request<{
        tree: Array<{ path: string; type: string }>;
      }>('GET', `/git/trees/${rootTreeSha}?recursive=true`);

      const normalizedDirectoryPath = normalizeDirectoryPath(path);

      const filesToFetch: { fullPath: string; relativePath: string }[] = [];

      for (const entry of treeData.tree) {
        if (entry.type !== 'blob') continue;

        let isMatch = false;
        let relativePath = '';

        if (normalizedDirectoryPath === '') {
          isMatch = true;
          relativePath = entry.path;
        } else if (entry.path.startsWith(`${normalizedDirectoryPath}/`)) {
          isMatch = true;
          relativePath = entry.path.substring(
            normalizedDirectoryPath.length + 1,
          );
        }

        if (isMatch) {
          if (recursive || !relativePath.includes('/')) {
            filesToFetch.push({ fullPath: entry.path, relativePath });
          }
        }
      }

      const fileContentsMap: Record<string, string> = {};
      const contentPromises = filesToFetch.map(async (file) => {
        const content = await this.getFileContent(branchName, file.fullPath);
        if (content !== undefined) {
          fileContentsMap[file.relativePath] = content;
        }
      });

      await Promise.all(contentPromises);

      return fileContentsMap;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404 Not Found')) {
        return {};
      }
      throw error;
    }
  }

  async commitChanges(
    branchName: string,
    changes: Record<string, string | null>,
    commitMessage: string,
  ): Promise<void> {
    const currentBranch = await this.request<{
      commit: { sha: string; commit: { tree: { sha: string } } };
    }>('GET', `/branches/${branchName}`);
    const baseTreeSha = currentBranch.commit.commit.tree.sha;
    const parentCommitSha = currentBranch.commit.sha;

    const tree = await Promise.all(
      Object.entries(changes).map(async ([path, content]) => {
        if (content === null) {
          return { path, mode: '100644', type: 'blob', sha: null };
        }
        const blob = await this.request<{ sha: string }>('POST', '/git/blobs', {
          content: content,
          encoding: 'utf-8',
        });
        return { path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );

    const newTree = await this.request<{ sha: string }>('POST', '/git/trees', {
      base_tree: baseTreeSha,
      tree: tree,
    });

    const newCommit = await this.request<{ sha: string }>(
      'POST',
      '/git/commits',
      {
        message: commitMessage,
        tree: newTree.sha,
        parents: [parentCommitSha],
      },
    );

    await this.request('PATCH', `/git/refs/heads/${branchName}`, {
      sha: newCommit.sha,
    });
  }

  async createPullRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string,
  ): Promise<string> {
    const existingPRs = await this.request<
      Array<{ number: number; html_url: string }>
    >(
      'GET',
      `/pulls?state=open&head=${this.owner}:${sourceBranch}&base=${targetBranch}`,
    );

    if (existingPRs.length > 0) {
      const prNumber = existingPRs[0].number;
      const updatedPR = await this.request<{ html_url: string }>(
        'PATCH',
        `/pulls/${prNumber}`,
        {
          title: title,
          body: description,
        },
      );
      return updatedPR.html_url;
    }

    const newPR = await this.request<{ html_url: string }>('POST', '/pulls', {
      title: title,
      body: description,
      head: sourceBranch,
      base: targetBranch,
    });
    return newPR.html_url;
  }
}
