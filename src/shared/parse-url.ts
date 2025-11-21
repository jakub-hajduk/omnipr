export interface ParsedURL {
  protocol: string;
  domain: string;
  path: string;
  query: string;
  fragment: string;
}

export function parseUrl(url: string): ParsedURL {
  const parts = url.match(
    /^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/,
  );

  return {
    protocol: parts?.[2] || '',
    domain: parts?.[4] || '',
    path: parts?.[5] || '',
    query: parts?.[7] || '',
    fragment: parts?.[9] || '',
  };
}
