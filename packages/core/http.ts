export type HttpFetchFn = (url: string, options?: RequestInit) => Promise<Response>;

let _httpFetch: HttpFetchFn | null = null;

export const setHttpFetch = (fn: HttpFetchFn) => {
  _httpFetch = fn;
};

export const getHttpFetch = () => {
  if (!_httpFetch) throw new Error("HttpFetch not set - call setHttpFetch() before first HTTP request");
  return _httpFetch;
};
