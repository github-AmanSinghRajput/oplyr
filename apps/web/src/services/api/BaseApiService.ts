export class BaseApiService {
  constructor(
    protected readonly baseUrl: string,
    private readonly apiAuthToken: string | null = null
  ) {}

  protected createHeaders(headers?: HeadersInit) {
    const nextHeaders = new Headers(headers);
    if (this.apiAuthToken) {
      nextHeaders.set('x-oplyr-local-auth', this.apiAuthToken);
    }
    return nextHeaders;
  }

  protected async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.createHeaders(init?.headers)
    });
    // Read as text first: an empty body (204) or a non-JSON error page would otherwise make
    // response.json() throw a SyntaxError that masks the real status code.
    const raw = await response.text();
    let body: {
      error?: string;
      code?: string;
      details?: unknown;
    } = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = response.ok ? {} : { error: raw.slice(0, 200) };
      }
    }

    if (!response.ok) {
      const details =
        body.details && typeof body.details === 'object'
          ? JSON.stringify(body.details)
          : typeof body.details === 'string'
            ? body.details
            : '';
      throw new Error([body.error ?? 'Request failed.', details].filter(Boolean).join(' '));
    }

    return body as T;
  }
}
