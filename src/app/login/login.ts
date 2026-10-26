import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';

import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.css',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSnackBarModule,
  ],
})
export class Login {
  loginForm = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(1)]],
  });

  // true = no error
  // false = show error
  loginvalid = true;

  errorMessage = '';
  isSubmitting = false;
  hidePassword = true;
  isRegisterMode = false;

  router = inject(Router);
  authService = inject(AuthService);
  notification = inject(NotificationService);

  get emailControl() {
    return this.loginForm.controls.email;
  }

  get passwordControl() {
    return this.loginForm.controls.password;
  }

  toggleMode(): void {
    this.isRegisterMode = !this.isRegisterMode;
    this.loginvalid = true;
    this.errorMessage = '';
    this.loginForm.reset();
    this.passwordControl.setValidators([
      Validators.required,
      ...(this.isRegisterMode ? [Validators.minLength(6)] : [Validators.minLength(1)]),
    ]);
    this.passwordControl.updateValueAndValidity();
  }

  login(): void {
    if (this.isSubmitting) {
      return;
    }

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.loginvalid = false;
      this.errorMessage = 'Please enter email and password';
      return;
    }

    this.isSubmitting = true;
    const { email, password } = this.loginForm.getRawValue();

    if (this.isRegisterMode) {
      this.authService.register(email, password).subscribe({
        next: (response) => {
          this.isSubmitting = false;
          this.loginvalid = response.response.status === 'SUCCESS';
          this.errorMessage =
            response.response.status === 'SUCCESS'
              ? 'Registration successful. Please log in.'
              : response.response.message;
          if (this.loginvalid) {
            this.notification.success('Registration successful. Please log in.');
            this.toggleMode();
          } else {
            this.notification.error(this.errorMessage);
          }
        },
        error: (error) => {
          this.isSubmitting = false;
          this.loginvalid = false;
          this.errorMessage =
            error.status === 409
              ? 'An account with this email already exists.'
              : error.status === 0
                ? 'Unable to connect to server'
                : error.status === 429
                  ? 'Too many attempts. Please try again later.'
                  : 'Registration failed. Please try again.';
          this.notification.error(this.errorMessage);
        },
      });
      return;
    }

    // Call Node.js API
    this.authService.login(email, password).subscribe({
      next: (response) => {
        const accessToken = response.data?.accessToken;
        if (response.response.status === 'SUCCESS' && accessToken) {
          // Store JWT token securely
          this.authService.storeToken(accessToken);
          this.loginvalid = true;
          this.errorMessage = '';
          this.isSubmitting = false;
          // Navigate to dashboard
          this.notification.success('Login successful.');
          this.router.navigate(['/dashboard']);
        } else {
          this.loginvalid = false;
          this.errorMessage = response.response.message || 'Login failed';
          this.notification.error(this.errorMessage);
          this.isSubmitting = false;
        }
      },
      error: (error) => {
        this.isSubmitting = false;
        this.loginvalid = false;
        if (error.status === 401) {
          this.errorMessage = 'Invalid email or password';
        } else if (error.status === 0) {
          this.errorMessage = 'Unable to connect to server';
        } else if (error.status === 429) {
          this.errorMessage = 'Too many attempts. Please try again later.';
        } else {
          this.errorMessage = 'Something went wrong. Please try again.';
        }
        this.notification.error(this.errorMessage);
      },
    });
  }
}
