import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);
  success(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3500, panelClass: ['notification-success'] });
  }
  error(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 5000, panelClass: ['notification-error'] });
  }
  info(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3500 });
  }
}
