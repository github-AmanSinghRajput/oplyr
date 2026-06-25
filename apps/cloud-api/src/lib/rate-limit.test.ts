import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimitMiddleware } from './rate-limit.js';

function runMiddleware(
  middleware: ReturnType<typeof createRateLimitMiddleware>,
  request: { ip?: string }
) {
  let nextError: unknown = null;
  middleware(request as never, {} as never, (error?: unknown) => {
    nextError = error ?? null;
  });
  return nextError;
}

test('createRateLimitMiddleware allows requests inside the request budget', () => {
  const middleware = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 2 });

  assert.equal(runMiddleware(middleware, { ip: '127.0.0.1' }), null);
  assert.equal(runMiddleware(middleware, { ip: '127.0.0.1' }), null);
});

test('createRateLimitMiddleware blocks requests after the limit is reached', () => {
  const middleware = createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 1 });

  assert.equal(runMiddleware(middleware, { ip: '127.0.0.1' }), null);
  const error = runMiddleware(middleware, { ip: '127.0.0.1' }) as {
    statusCode?: number;
    code?: string;
  };

  assert.equal(error.statusCode, 429);
  assert.equal(error.code, 'RATE_LIMITED');
});

test('createRateLimitMiddleware resets counters after the configured window', () => {
  const realNow = Date.now;
  let fakeNow = 1_000;
  Date.now = () => fakeNow;

  try {
    const middleware = createRateLimitMiddleware({ windowMs: 100, maxRequests: 1 });

    assert.equal(runMiddleware(middleware, { ip: '127.0.0.1' }), null);
    assert.equal(
      (runMiddleware(middleware, { ip: '127.0.0.1' }) as { code?: string }).code,
      'RATE_LIMITED'
    );

    fakeNow += 101;

    assert.equal(runMiddleware(middleware, { ip: '127.0.0.1' }), null);
  } finally {
    Date.now = realNow;
  }
});
