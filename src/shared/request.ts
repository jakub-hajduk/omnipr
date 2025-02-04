interface RequestConstructorOptions {
  fetch: typeof fetch;
  url: string;
  headers: Record<string, string>;
  extractErrorMessage: (error: any) => Omit<ErrorDetails, 'url'>;
}

interface RequestOptions extends RequestInit {
  headers: HeadersInit;
  query: Record<string, string | number | boolean>;
  json: Record<string, any>;
}

const parseQuery = (input: Record<string, string | number | boolean>) => {
  const out = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    out.set(key, value.toString());
  }

  return out;
};

export interface ErrorDetails {
  status: number;
  message: string;
  url: string;
}

interface HTTPResponse<T> {
  json(): Promise<T>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
}

export class RequestError extends Error {
  url: string;
  message: string;
  status: number;
  constructor(public details: ErrorDetails) {
    super(details.message);
    this.url = details.url;
    this.message = details.message;
    this.status =
      typeof details.status === 'string'
        ? Number.parseInt(details.status, 10)
        : details.status;
  }
}

function mergeHeaders(
  defaultHeaders: HeadersInit,
  newHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(defaultHeaders);
  if (newHeaders) {
    for (const [key, value] of Object.entries(newHeaders)) {
      headers.set(key, value);
    }
  }
  return headers;
}

export class HTTPRequest {
  fetch: typeof fetch = fetch;
  prefixUrl: string;

  options: RequestConstructorOptions = {
    extractErrorMessage: () => ({
      url: 'unknown',
      message: 'unknown',
      status: 0,
    }),
    fetch: fetch,
    headers: {},
    url: '',
  };

  constructor(options: Partial<RequestConstructorOptions>) {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  private request<T>(
    url: string,
    options: Partial<RequestOptions>,
  ): HTTPResponse<T> {
    options.headers = mergeHeaders(this.options.headers, options.headers);
    const params = parseQuery(options.query).toString();

    let finalUrl = this.options.url.endsWith('/')
      ? this.options.url + url
      : `${this.options.url}/${url}`;

    if (params) {
      finalUrl = `${finalUrl}?${params}`;
    }

    if (options.json) {
      options.body = JSON.stringify(options.json);
    }

    const request = <T>(): Promise<any> =>
      this.options.fetch(finalUrl, options).then(async (response: Response) => {
        if (!response.ok) {
          const extractedError = await response.json().then((errorDetails) => {
            return {
              ...this.options.extractErrorMessage(errorDetails),
              url,
            };
          });
          throw new RequestError(extractedError);
        }

        return response as HTTPResponse<T>;
      });

    return {
      json: () => request<T>().then((r) => r.json()) as Promise<T>,
      text: () => request<string>().then((r) => r.text()) as Promise<string>,
      blob: () => request<Blob>().then((r) => r.blob()) as Promise<Blob>,
    };
  }

  get<T = any>(
    url: string,
    options?: Partial<RequestOptions>,
  ): HTTPResponse<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  post<T = any>(
    url: string,
    options?: Partial<RequestOptions>,
  ): HTTPResponse<T> {
    return this.request<T>(url, { ...options, method: 'POST' });
  }

  put<T = any>(
    url: string,
    options?: Partial<RequestOptions>,
  ): HTTPResponse<T> {
    return this.request<T>(url, { ...options, method: 'PUT' });
  }

  delete<T = any>(
    url: string,
    options?: Partial<RequestOptions>,
  ): HTTPResponse<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }
}
