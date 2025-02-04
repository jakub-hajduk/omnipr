import type { HTTPError } from 'ky';

export async function extractErrorMessage(extractFn: (error: any) => string) {
  return async function extract(error: HTTPError) {
    const errorDetails = await error.response.json();
    error.message = extractFn(errorDetails);
    return error;
  };
}
