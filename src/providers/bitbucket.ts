import { parseUrl } from '../shared/parse-url';
import { normalizeDirectoryPath } from '../shared/path-utils';
import type { Provider } from '../shared/types';

interface BitbucketProviderConfig {
  token: string;
  url: string;
}

interface BitbucketPullRequest {
  id: number;
  links: { html: { href: string } };
}

export class BitbucketProvider implements Provider {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;
  public fetch: typeof fetch = globalThis.fetch;

  constructor(config: BitbucketProviderConfig) {
    const { path } = parseUrl(config.url);

    const [projectKey, repositorySlug] = path
      .replace(/^\/|\/$/g, '')
      .split('/');

    this.baseUrl = `https://api.bitbucket.org/2.0/repositories/${projectKey}/${repositorySlug}`;
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object | FormData,
    isJson = true,
  ): Promise<T> {
    const headers: HeadersInit = { ...this.headers };
    if (isJson) {
      (headers as any)['Content-Type'] = 'application/json';
    }

    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Bitbucket API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    if (
      !isJson ||
      response.status === 204 ||
      (response.status === 200 &&
        response.headers.get('Content-Length') === '0')
    ) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  async getBranchSha(branchName: string): Promise<string | undefined> {
    try {
      const data = await this.request<{ target: { hash: string } }>(
        'GET',
        `/refs/branches/${branchName}`,
      );
      return data.target.hash;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404 Not Found')) {
        return undefined;
      }
      throw error;
    }
  }

  async createBranch(branchName: string, sha: string): Promise<void> {
    await this.request('POST', '/refs/branches', {
      name: branchName,
      target: {
        hash: sha,
      },
    });
  }

  async deleteBranch(branchName: string): Promise<void> {
    await this.request('DELETE', `/refs/branches/${branchName}`);
  }

  async getFileContent(
    branchName: string,
    filePath: string,
  ): Promise<string | undefined> {
    const response = await fetch(
      `${this.baseUrl}/src/${branchName}/${filePath}`,
      {
        headers: this.headers,
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return undefined;
      }
      const errorBody = await response.text();
      throw new Error(
        `Bitbucket API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }
    return response.text();
  }

  async pull(
    branchName: string,
    path = './',
    recursive = false,
  ): Promise<Record<string, string>> {
    const filesMap: Record<string, string> = {};
    const normalizedDirectoryPath = normalizeDirectoryPath(path);
    let nextUrl: string | undefined =
      `${this.baseUrl}/src/${branchName}?pagelen=100`;

    try {
      while (nextUrl) {
        const response = await fetch(nextUrl, { headers: this.headers });
        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Bitbucket API error: ${response.status} ${response.statusText} - ${errorBody}`,
          );
        }
        const page = (await response.json()) as {
          values: Array<{ path: string; type: string }>;
          next?: string;
        };

        for (const entry of page.values) {
          if (entry.type === 'commit_file') {
            const fullPath = entry.path;

            let isMatch = false;
            let relativePath = '';

            if (normalizedDirectoryPath === '') {
              isMatch = true;
              relativePath = fullPath;
            } else if (fullPath.startsWith(`${normalizedDirectoryPath}/`)) {
              isMatch = true;
              relativePath = fullPath.substring(
                normalizedDirectoryPath.length + 1,
              );
            }

            if (isMatch) {
              if (recursive || !relativePath.includes('/')) {
                const content = await this.getFileContent(branchName, fullPath);
                if (content !== undefined) {
                  filesMap[relativePath] = content;
                }
              }
            }
          }
        }
        nextUrl = page.next;
      }
      return filesMap;
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
    const formData = new FormData();
    formData.append('branch', branchName);
    formData.append('message', commitMessage);

    for (const [filePath, content] of Object.entries(changes)) {
      if (content === null) {
        // Bitbucket's src endpoint uses the 'files' parameter to indicate which files to delete.
        formData.append('files', filePath);
      } else {
        formData.append(filePath, content);
      }
    }

    // The body is FormData, so we pass `false` for the isJson flag.
    await this.request('POST', '/src', formData, false);
  }

  async createPullRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string,
  ): Promise<string> {
    const q = `source.branch.name = "${sourceBranch}" AND destination.branch.name = "${targetBranch}" AND state = "OPEN"`;
    const existingPRs = await this.request<{ values: BitbucketPullRequest[] }>(
      'GET',
      `/pullrequests?q=${encodeURIComponent(q)}`,
    );

    if (existingPRs.values.length > 0) {
      const prId = existingPRs.values[0].id;
      const updatedPR = await this.request<BitbucketPullRequest>(
        'PUT',
        `/pullrequests/${prId}`,
        {
          title: title,
          description: description,
        },
      );
      return updatedPR.links.html.href;
    }
    const newPR = await this.request<BitbucketPullRequest>(
      'POST',
      '/pullrequests',
      {
        title: title,
        description: description,
        source: {
          branch: {
            name: sourceBranch,
          },
        },
        destination: {
          branch: {
            name: targetBranch,
          },
        },
      },
    );
    return newPR.links.html.href;
  }
}
