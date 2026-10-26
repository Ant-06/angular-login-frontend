import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate required email and password fields', () => {
    expect(component.loginForm.invalid).toBe(true);
    component.loginForm.setValue({ email: 'valid@example.com', password: 'secret' });
    expect(component.loginForm.valid).toBe(true);
  });

  it('should enforce the registration password rule when toggled', () => {
    component.toggleMode();
    component.loginForm.setValue({ email: 'valid@example.com', password: 'short' });
    expect(component.loginForm.invalid).toBe(true);
    component.loginForm.setValue({ email: 'valid@example.com', password: 'Password123' });
    expect(component.loginForm.valid).toBe(true);
  });
});
