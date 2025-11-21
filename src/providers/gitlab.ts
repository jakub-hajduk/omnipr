import type { Provider } from "../shared/types";
import { normalizeDirectoryPath } from "../shared/path-utils";

interface GitlabProviderConfig {
  token: string;
  url: string;
  projectId: string;
}

export class GitlabProvider implements Provider {
  private readonly baseUrl: string;
  private readonly headers: HeadersInit;
  private readonly projectId: string;
  public fetch = globalThis.fetch;

  constructor(config: GitlabProviderConfig) {
    this.projectId = this.encodeFilePath(config.projectId); // Project ID or path needs to be encoded for URL
    this.baseUrl = `${config.url}/api/v4/projects/${this.projectId}`;
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
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
        `GitLab API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    if (response.status === 204) {
      return undefined as T; // No content for 204
    }

    return response.json() as Promise<T>;
  }

  // Helper to encode file paths and branch names for GitLab API
  private encodeFilePath(path: string): string {
    return encodeURIComponent(path).replace(/\./g, "%2E");
  }

  async getBranchSha(branchName: string): Promise<string | undefined> {
    try {
      const data = await this.request<{ commit: { id: string } }>(
        "GET",
        `/repository/branches/${this.encodeFilePath(branchName)}`,
      );
      return data.commit.id;
    } catch (error) {
      if (error instanceof Error && error.message.includes("404 Not Found")) {
        return undefined;
      }
      throw error;
    }
  }

  async createBranch(branchName: string, sha: string): Promise<void> {
    await this.request("POST", "/repository/branches", {
      branch: branchName,
      ref: sha,
    });
  }

  async deleteBranch(branchName: string): Promise<void> {
    await this.request(
      "DELETE",
      `/repository/branches/${this.encodeFilePath(branchName)}`,
    );
  }

  async getFileContent(
    branchName: string,
    filePath: string,
  ): Promise<string | undefined> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repository/files/${this.encodeFilePath(filePath)}/raw?ref=${this.encodeFilePath(branchName)}`,
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
          `GitLab API error: ${response.status} ${response.statusText} - ${errorBody}`,
        );
      }
      return response.text();
    } catch (error) {
      throw error;
    }
  }

  async pull(
    branchName: string,
    path: string = "./",
    recursive = false,
  ): Promise<Map<string, string>> {
    try {
      const normalizedDirectoryPath = normalizeDirectoryPath(path);
      const tree = await this.request<Array<{ path: string; type: string }>>(
        "GET",
        `/repository/tree?ref=${this.encodeFilePath(branchName)}&path=${this.encodeFilePath(normalizedDirectoryPath)}&recursive=${recursive}&per_page=100`,
      );

      const fileContentsMap = new Map<string, string>();
      const contentPromises = tree
        .filter((item) => item.type === "blob")
        .map(async (item) => {
          const content = await this.getFileContent(branchName, item.path);
          if (content !== undefined) {
            let relativePath = item.path;
            if (
              normalizedDirectoryPath &&
              item.path.startsWith(`${normalizedDirectoryPath}/`)
            ) {
              relativePath = item.path.substring(
                normalizedDirectoryPath.length + 1,
              );
            } else if (normalizedDirectoryPath === "") {
              // If normalizedDirectoryPath is empty, it means root, so relative path is full path
              relativePath = item.path;
            }
            fileContentsMap.set(relativePath, content);
          }
        });

      await Promise.all(contentPromises);

      return fileContentsMap;
    } catch (error) {
      if (error instanceof Error && error.message.includes("404 Not Found")) {
        return new Map<string, string>();
      }
      throw error;
    }
  }

  async commitChanges(
    branchName: string,
    changes: Record<string, string | null>,
    commitMessage: string,
  ): Promise<void> {
    const actions = await Promise.all(
      Object.entries(changes).map(async ([filePath, content]) => {
        if (content === null) {
          return {
            action: "delete",
            file_path: filePath,
          };
        }

        const fileExists =
          (await this.getFileContent(branchName, filePath)) !== undefined;

        if (fileExists) {
          return {
            action: "update",
            file_path: filePath,
            content: content,
            encoding: "text",
          };
        }
        return {
          action: "create",
          file_path: filePath,
          content: content,
          encoding: "text",
        };
      }),
    );

    if (actions.length === 0) {
      return;
    }

    await this.request("POST", "/repository/commits", {
      branch: branchName,
      commit_message: commitMessage,
      actions: actions,
      start_branch: branchName,
    });
  }

  async createPullRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string,
  ): Promise<string> {
    interface GitLabMergeRequest {
      iid: number;
      web_url: string;
    }

    const existingMRs = await this.request<GitLabMergeRequest[]>(
      "GET",
      `/merge_requests?state=opened&source_branch=${this.encodeFilePath(sourceBranch)}&target_branch=${this.encodeFilePath(targetBranch)}`,
    );

    if (existingMRs.length > 0) {
      const mrIid = existingMRs[0].iid;
      const updatedMR = await this.request<GitLabMergeRequest>(
        "PUT",
        `/merge_requests/${mrIid}`,
        {
          title: title,
          description: description,
        },
      );
      return updatedMR.web_url;
    } else {
      const newMR = await this.request<GitLabMergeRequest>(
        "POST",
        "/merge_requests",
        {
          source_branch: sourceBranch,
          target_branch: targetBranch,
          title: title,
          description: description,
        },
      );
      return newMR.web_url;
    }
  }
}
