import { Injectable } from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, catchError, finalize, of, shareReplay, switchMap, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

export const authRetry = new HttpContextToken<boolean>(() => false);

export class SessionRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionRefreshError';
  }
}

/**
 * Checks whether a given path matches the base path with path boundary.
 * e.g., for basePath '/api':
 * - '/api' -> true
 * - '/api/' -> true
 * - '/api/users' -> true
 * - '/api-malicious' -> false
 * - '/apixyz' -> false
 */
export function matchesPathBoundary(pathname: string, basePath: string): boolean {
  const cleanBase = basePath.replace(/\/+$/, '');
  if (!cleanBase || cleanBase === '') {
    return true;
  }
  return (
    pathname === cleanBase ||
    pathname.startsWith(cleanBase + '/') ||
    pathname.startsWith(cleanBase + '?') ||
    pathname.startsWith(cleanBase + '#')
  );
}

/**
 * Validates whether the given request URL targets a trusted API endpoint.
 * Prevents token leakage to third-party domains and invalid path prefixes.
 */
export function isTrustedApiRequest(
  requestUrl: string,
  configuredApiUrl: string = environment.apiUrl,
  currentOrigin?: string,
): boolean {
  if (!requestUrl || !configuredApiUrl) {
    return false;
  }

  // Determine current application origin (browser vs SSR vs explicitly provided)
  const appOrigin =
    currentOrigin ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined);

  // Parse configured API URL to determine trusted origin and base path
  let trustedApiOrigin: string | undefined;
  let apiBasePath: string;

  try {
    const parsedApiUrl = new URL(configuredApiUrl);
    trustedApiOrigin = parsedApiUrl.origin;
    apiBasePath = parsedApiUrl.pathname.replace(/\/+$/, '') || '/';
  } catch {
    // configuredApiUrl is relative, e.g. '/api'
    apiBasePath =
      (configuredApiUrl.startsWith('/') ? configuredApiUrl : '/' + configuredApiUrl).replace(
        /\/+$/,
        '',
      ) || '/';
    trustedApiOrigin = appOrigin;
  }

  // Detect protocol-relative URLs like '//evil.com/api' or full absolute URLs
  const isProtocolRelative = requestUrl.startsWith('//');
  const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(requestUrl) || isProtocolRelative;

  if (isAbsolute) {
    try {
      const fullUrl = isProtocolRelative ? 'http:' + requestUrl : requestUrl;
      const parsedReq = new URL(fullUrl);

      // If there is no trusted origin (e.g. SSR with relative apiUrl and unknown host),
      // do not trust external absolute URLs.
      if (!trustedApiOrigin) {
        return false;
      }

      if (parsedReq.origin.toLowerCase() !== trustedApiOrigin.toLowerCase()) {
        return false;
      }

      return matchesPathBoundary(parsedReq.pathname, apiBasePath);
    } catch {
      return false;
    }
  }

  // Request URL is relative (e.g. '/api/auth/me', 'api/auth/me')
  let reqPathname = requestUrl.startsWith('/') ? requestUrl : '/' + requestUrl;
  reqPathname = reqPathname.split('?')[0].split('#')[0];

  return matchesPathBoundary(reqPathname, apiBasePath);
}

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private refreshRequest$?: Observable<unknown>;

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!isTrustedApiRequest(req.url)) {
      return next.handle(req);
    }

    const token = this.authService.getToken();
    const isAuthenticationRequest = req.url.endsWith('/login') || req.url.endsWith('/register');
    const isRefreshRequest = req.url.endsWith('/refresh');
    const request =
      token && !isAuthenticationRequest && !isRefreshRequest
        ? req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
            withCredentials: true,
          })
        : req;

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        const alreadyRetried = req.context.get(authRetry);
        if (
          error.status === 401 &&
          !isAuthenticationRequest &&
          !isRefreshRequest &&
          !alreadyRetried
        ) {
          return this.refreshSession().pipe(
            switchMap(() => {
              const refreshedToken = this.authService.getToken();
              if (!refreshedToken) {
                return throwError(
                  () => new SessionRefreshError('Session refresh returned no access token'),
                );
              }
              const headers = req.headers
                .delete('Authorization')
                .set('Authorization', `Bearer ${refreshedToken}`);
              return next.handle(
                req.clone({
                  headers,
                  context: req.context.set(authRetry, true),
                  withCredentials: true,
                }),
              );
            }),
            catchError((refreshError) => {
              const isUnrecoverable =
                refreshError instanceof SessionRefreshError ||
                (refreshError instanceof HttpErrorResponse &&
                  (refreshError.status === 401 || refreshError.status === 403));
              if (isUnrecoverable) {
                this.authService.clearSession();
                void this.router.navigate(['/login']);
              }
              return throwError(() => refreshError);
            }),
          );
        }
        return throwError(() => error);
      }),
    );
  }

  private refreshSession(): Observable<unknown> {
    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.authService.refresh().pipe(
        switchMap((response) => {
          const accessToken = response?.data?.accessToken;
          const isSuccess = response?.response?.status === 'SUCCESS';
          const isValidToken = typeof accessToken === 'string' && accessToken.trim().length > 0;

          if (!isSuccess || !isValidToken) {
            this.authService.clearSession();
            return throwError(
              () => new SessionRefreshError('Session refresh returned an invalid response'),
            );
          }
          this.authService.storeToken(accessToken);
          return of(response);
        }),
        catchError((err) => {
          if (err instanceof SessionRefreshError) {
            return throwError(() => err);
          }
          const isAuthFailure =
            err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403);
          if (isAuthFailure) {
            this.authService.clearSession();
            return throwError(
              () => new SessionRefreshError('Refresh session expired, revoked, or rejected'),
            );
          }
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshRequest$ = undefined;
        }),
        shareReplay(1),
      );
    }
    return this.refreshRequest$;
  }
}
