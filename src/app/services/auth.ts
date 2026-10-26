import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
export interface LoginResponse {
  response: ApiResponse;
  data?: {
    accessToken?: string;
    token?: string;
    [key: string]: any;
  };
}

export interface ApiResponse {
  status: 'SUCCESS' | 'ERROR';
  message: string;
  code: number;
  errors: Array<{ field?: string; message: string }>;
}

export interface User {
  id: string;
  email: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  private hasStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiUrl}/auth/login`,
      {
        email: email,
        password: password,
      },
      { withCredentials: true },
    );
  }

  register(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiUrl}/auth/register`,
      { email, password },
      { withCredentials: true },
    );
  }

  refresh(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiUrl}/auth/refresh`,
      {},
      { withCredentials: true },
    );
  }

  clearSession(): void {
    if (this.hasStorage()) {
      window.localStorage.removeItem('authToken');
    }
  }

  getCurrentUser(): Observable<{ response: ApiResponse; data?: User }> {
    return this.http.get<{ response: ApiResponse; data?: User }>(`${this.apiUrl}/auth/me`);
  }

  storeToken(token: string): void {
    if (this.hasStorage()) {
      window.localStorage.setItem('authToken', token);
    }
  }

  /** Retrieve stored JWT token */
  getToken(): string | null {
    if (!this.hasStorage()) {
      return null;
    }
    return window.localStorage.getItem('authToken');
  }

  /** Simple check for authentication */
  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const payload = token.split('.')[1];
      const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now();
    } catch {
      this.clearSession();
      return false;
    }
  }

  /** Logout user */
  logout(): Observable<unknown> {
    this.clearSession();
    return this.http.post(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true });
  }
}
