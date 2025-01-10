import type { GitProviderReturnType } from './types';

export class GitProviderError extends Error {
  constructor(public error: GitProviderReturnType) {
    super();
    this.name = '';
    this.stack = '';
    this.message = '';
    return;
  }
}
