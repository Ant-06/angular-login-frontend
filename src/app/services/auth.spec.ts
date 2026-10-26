import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { AuthService } from './auth';
import { environment } from '../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should accept a valid unexpired token and reject an expired token', () => {
    const encode = (value: object) => btoa(JSON.stringify(value));
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const validPayload = encode({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const expiredPayload = encode({ exp: Math.floor(Date.now() / 1000) - 3600 });

    service.storeToken(`${header}.${validPayload}.signature`);
    expect(service.isLoggedIn()).toBe(true);

    service.storeToken(`${header}.${expiredPayload}.signature`);
    expect(service.isLoggedIn()).toBe(false);
  });

  it('should remove the stored token on logout', () => {
    service.storeToken('header.payload.signature');
    service.logout();
    expect(service.getToken()).toBeNull();
  });

  it('should use the standardized auth endpoint and credentials', () => {
    service.login('user@example.com', 'Password123').subscribe();
    const request = http.expectOne(`${environment.apiUrl}/auth/login`);
    expect(request.request.withCredentials).toBe(true);
    request.flush({
      response: { status: 'SUCCESS', message: 'Login successful', code: 200, errors: [] },
      data: {},
    });
  });
});
