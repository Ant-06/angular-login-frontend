import {
  HttpErrorResponse,
  HttpHandler,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  const createAuthService = (token = 'old-token') => ({
    currentToken: token,
    getToken: vi.fn(function (this: { currentToken: string }) {
      return this.currentToken;
    }),
    refresh: vi.fn((): Observable<any> =>
      of({
        response: { status: 'SUCCESS', message: 'Token refreshed', code: 200, errors: [] },
        data: { accessToken: 'new-token' },
      }),
    ),
    storeToken: vi.fn(function (this: { currentToken: string }, value: string) {
      this.currentToken = value;
    }),
    clearSession: vi.fn(),
  });

  it('replaces a stale authorization header after refresh', () => {
    const auth = createAuthService();
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const calls: HttpRequest<unknown>[] = [];
    const handler: HttpHandler = {
      handle: vi.fn((request: HttpRequest<unknown>) => {
        calls.push(request);
        return calls.length === 1
          ? throwError(() => new HttpErrorResponse({ status: 401 }))
          : of(new HttpResponse({ status: 200, body: {} }));
      }),
    };

    interceptor
      .intercept(
        new HttpRequest('GET', 'http://localhost:3000/api/auth/me', {
          headers: new HttpHeaders({ Authorization: 'Bearer stale-token' }),
        }),
        handler,
      )
      .subscribe();

    expect(calls[0].headers.get('Authorization')).toBe('Bearer old-token');
    expect(calls[1].headers.get('Authorization')).toBe('Bearer new-token');
    expect(auth.storeToken).toHaveBeenCalledWith('new-token');
    expect(auth.clearSession).not.toHaveBeenCalled();
  });

  it('does not clear the session for a forbidden response', () => {
    const auth = createAuthService();
    const router = { navigate: vi.fn() };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const handler: HttpHandler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 }))),
    };

    interceptor
      .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
      .subscribe({ error: () => undefined });

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not clear the session when the retried request fails with a server error', () => {
    const auth = createAuthService();
    const router = { navigate: vi.fn() };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    let calls = 0;
    const handler: HttpHandler = {
      handle: vi.fn(() => {
        calls += 1;
        return throwError(() => new HttpErrorResponse({ status: calls === 1 ? 401 : 500 }));
      }),
    };

    interceptor
      .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
      .subscribe({ error: () => undefined });

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('clears session and redirects when refresh returns success but no access token', () => {
    const auth = createAuthService();
    auth.refresh = vi.fn((): Observable<any> =>
      of({
        response: { status: 'SUCCESS', message: 'Token refreshed', code: 200, errors: [] },
        data: {},
      }),
    ) as never;
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const handler: HttpHandler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
    };

    interceptor
      .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
      .subscribe({ error: () => undefined });

    expect(auth.clearSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('clears session and redirects when refresh returns an ERROR status', () => {
    const auth = createAuthService();
    auth.refresh = vi.fn((): Observable<any> =>
      of({
        response: { status: 'ERROR', message: 'Session expired', code: 401, errors: [] },
        data: null,
      }),
    ) as never;
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const handler: HttpHandler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
    };

    interceptor
      .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
      .subscribe({ error: () => undefined });

    expect(auth.clearSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('clears session and redirects when refresh HTTP call returns 401', () => {
    const auth = createAuthService();
    auth.refresh = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 })));
    const router = { navigate: vi.fn(() => Promise.resolve(true)) };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const handler: HttpHandler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
    };

    interceptor
      .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
      .subscribe({ error: () => undefined });

    expect(auth.clearSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('does not clear session when refresh HTTP call returns 500', () => {
    const auth = createAuthService();
    auth.refresh = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    const router = { navigate: vi.fn() };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const handler: HttpHandler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
    };

    interceptor
      .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
      .subscribe({ error: () => undefined });

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not retry authentication requests (login/register)', () => {
    const auth = createAuthService();
    const router = { navigate: vi.fn() };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const handler: HttpHandler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
    };

    interceptor
      .intercept(new HttpRequest('POST', 'http://localhost:3000/api/auth/login', {}), handler)
      .subscribe({ error: () => undefined });

    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('does not retry refresh requests', () => {
    const auth = createAuthService();
    const router = { navigate: vi.fn() };
    const interceptor = new AuthInterceptor(auth as never, router as never);
    const handler: HttpHandler = {
      handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
    };

    interceptor
      .intercept(new HttpRequest('POST', 'http://localhost:3000/api/auth/refresh', {}), handler)
      .subscribe({ error: () => undefined });

    expect(auth.refresh).not.toHaveBeenCalled();
  });

  describe('Cross-Origin Token Leakage Prevention', () => {
    it('does not attach token or credentials to unrelated third-party hosts with /api paths', () => {
      const auth = createAuthService('secret-token');
      const router = { navigate: vi.fn() };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      let capturedRequest: HttpRequest<unknown> | undefined;
      const handler: HttpHandler = {
        handle: vi.fn((req: HttpRequest<unknown>) => {
          capturedRequest = req;
          return of(new HttpResponse({ status: 200 }));
        }),
      };

      interceptor
        .intercept(new HttpRequest('GET', 'https://attacker.com/api/steal-token'), handler)
        .subscribe();

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest?.headers.has('Authorization')).toBe(false);
      expect(capturedRequest?.withCredentials).toBe(false);
    });

    it('does not attach token or credentials to protocol-relative third-party URLs', () => {
      const auth = createAuthService('secret-token');
      const router = { navigate: vi.fn() };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      let capturedRequest: HttpRequest<unknown> | undefined;
      const handler: HttpHandler = {
        handle: vi.fn((req: HttpRequest<unknown>) => {
          capturedRequest = req;
          return of(new HttpResponse({ status: 200 }));
        }),
      };

      interceptor.intercept(new HttpRequest('GET', '//evil.com/api/tokens'), handler).subscribe();

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest?.headers.has('Authorization')).toBe(false);
      expect(capturedRequest?.withCredentials).toBe(false);
    });

    it('does not attach token or credentials to similar but invalid API prefixes (/api-malicious)', () => {
      const auth = createAuthService('secret-token');
      const router = { navigate: vi.fn() };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      let capturedRequest: HttpRequest<unknown> | undefined;
      const handler: HttpHandler = {
        handle: vi.fn((req: HttpRequest<unknown>) => {
          capturedRequest = req;
          return of(new HttpResponse({ status: 200 }));
        }),
      };

      interceptor
        .intercept(new HttpRequest('GET', 'http://localhost:3000/api-malicious/test'), handler)
        .subscribe();

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest?.headers.has('Authorization')).toBe(false);
      expect(capturedRequest?.withCredentials).toBe(false);
    });

    it('does not attach token or credentials to non-API requests', () => {
      const auth = createAuthService('secret-token');
      const router = { navigate: vi.fn() };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      let capturedRequest: HttpRequest<unknown> | undefined;
      const handler: HttpHandler = {
        handle: vi.fn((req: HttpRequest<unknown>) => {
          capturedRequest = req;
          return of(new HttpResponse({ status: 200 }));
        }),
      };

      interceptor
        .intercept(new HttpRequest('GET', 'https://google.com/search'), handler)
        .subscribe();

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest?.headers.has('Authorization')).toBe(false);
      expect(capturedRequest?.withCredentials).toBe(false);
    });

    it('attaches token and credentials to trusted absolute API URLs', () => {
      const auth = createAuthService('valid-access-token');
      const router = { navigate: vi.fn() };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      let capturedRequest: HttpRequest<unknown> | undefined;
      const handler: HttpHandler = {
        handle: vi.fn((req: HttpRequest<unknown>) => {
          capturedRequest = req;
          return of(new HttpResponse({ status: 200 }));
        }),
      };

      interceptor
        .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
        .subscribe();

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest?.headers.get('Authorization')).toBe('Bearer valid-access-token');
      expect(capturedRequest?.withCredentials).toBe(true);
    });

    it('attaches token and credentials to same-origin relative API requests', () => {
      const auth = createAuthService('valid-access-token');
      const router = { navigate: vi.fn() };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      let capturedRequest: HttpRequest<unknown> | undefined;
      const handler: HttpHandler = {
        handle: vi.fn((req: HttpRequest<unknown>) => {
          capturedRequest = req;
          return of(new HttpResponse({ status: 200 }));
        }),
      };

      interceptor.intercept(new HttpRequest('GET', '/api/users/profile'), handler).subscribe();

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest?.headers.get('Authorization')).toBe('Bearer valid-access-token');
      expect(capturedRequest?.withCredentials).toBe(true);
    });
  });

  describe('Refresh 403 and Malformed Response Handling', () => {
    it('clears session and redirects when refresh returns HTTP 403 (suspended/revoked account)', () => {
      const auth = createAuthService();
      auth.refresh = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 403 })));
      const router = { navigate: vi.fn(() => Promise.resolve(true)) };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      const handler: HttpHandler = {
        handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
      };

      interceptor
        .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
        .subscribe({ error: () => undefined });

      expect(auth.clearSession).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clears session and redirects when refresh returns an empty string access token', () => {
      const auth = createAuthService();
      auth.refresh = vi.fn((): Observable<any> =>
        of({
          response: { status: 'SUCCESS', message: 'Token refreshed', code: 200, errors: [] },
          data: { accessToken: '' },
        }),
      ) as never;
      const router = { navigate: vi.fn(() => Promise.resolve(true)) };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      const handler: HttpHandler = {
        handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
      };

      interceptor
        .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
        .subscribe({ error: () => undefined });

      expect(auth.clearSession).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clears session and redirects when refresh returns non-string access token', () => {
      const auth = createAuthService();
      auth.refresh = vi.fn((): Observable<any> =>
        of({
          response: { status: 'SUCCESS', message: 'Token refreshed', code: 200, errors: [] },
          data: { accessToken: 12345 },
        }),
      ) as never;
      const router = { navigate: vi.fn(() => Promise.resolve(true)) };
      const interceptor = new AuthInterceptor(auth as never, router as never);
      const handler: HttpHandler = {
        handle: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
      };

      interceptor
        .intercept(new HttpRequest('GET', 'http://localhost:3000/api/auth/me'), handler)
        .subscribe({ error: () => undefined });

      expect(auth.clearSession).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('coordinates multiple concurrent requests to perform exactly one refresh operation', () => {
      const auth = createAuthService('expired-token');
      const refreshSubject = new Subject<any>();
      auth.refresh = vi.fn(() => refreshSubject.asObservable());
      const router = { navigate: vi.fn() };
      const interceptor = new AuthInterceptor(auth as never, router as never);

      let callCount = 0;
      const handler: HttpHandler = {
        handle: vi.fn((_req: HttpRequest<unknown>) => {
          callCount++;
          if (callCount <= 2) {
            // Both initial requests fail with 401
            return throwError(() => new HttpErrorResponse({ status: 401 }));
          }
          return of(new HttpResponse({ status: 200, body: { data: 'ok' } }));
        }),
      };

      const req1$ = interceptor.intercept(
        new HttpRequest('GET', 'http://localhost:3000/api/req1'),
        handler,
      );
      const req2$ = interceptor.intercept(
        new HttpRequest('GET', 'http://localhost:3000/api/req2'),
        handler,
      );

      req1$.subscribe();
      req2$.subscribe();

      // Emit refresh response while both requests are waiting
      refreshSubject.next({
        response: { status: 'SUCCESS', message: 'Refreshed', code: 200, errors: [] },
        data: { accessToken: 'coordinated-token' },
      });
      refreshSubject.complete();

      // Only 1 refresh call should have been triggered across both concurrent requests
      expect(auth.refresh).toHaveBeenCalledTimes(1);
    });
  });
});
