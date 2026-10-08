import { describe, it, expect } from 'vitest';
import { emailLoginSchema, emailSignupSchema } from './auth.schema';

describe('emailLoginSchema', () => {
  it('validates correct email and password inputs', () => {
    const res = emailLoginSchema.safeParse({
      email: 'wanjiku@tradeweft.co.ke',
      password: 'StrongPassword123',
    });
    expect(res.success).toBe(true);
  });

  it('rejects invalid email formats', () => {
    const res = emailLoginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it('rejects empty password', () => {
    const res = emailLoginSchema.safeParse({
      email: 'wanjiku@tradeweft.co.ke',
      password: '',
    });
    expect(res.success).toBe(false);
  });
});

describe('emailSignupSchema', () => {
  const validSignup = {
    email: 'kamau@tradeweft.co.ke',
    password: 'SecurePassword1',
    confirmPassword: 'SecurePassword1',
    termsAccepted: true as const,
  };

  it('validates strong password and matching confirmation', () => {
    const res = emailSignupSchema.safeParse(validSignup);
    expect(res.success).toBe(true);
  });

  it('rejects password shorter than 8 characters', () => {
    const res = emailSignupSchema.safeParse({
      ...validSignup,
      password: 'Pass1',
      confirmPassword: 'Pass1',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.password).toBeDefined();
    }
  });

  it('rejects password without numbers', () => {
    const res = emailSignupSchema.safeParse({
      ...validSignup,
      password: 'PasswordOnly',
      confirmPassword: 'PasswordOnly',
    });
    expect(res.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const res = emailSignupSchema.safeParse({
      ...validSignup,
      password: 'password123',
      confirmPassword: 'password123',
    });
    expect(res.success).toBe(false);
  });

  it('rejects mismatched password and confirmPassword', () => {
    const res = emailSignupSchema.safeParse({
      ...validSignup,
      confirmPassword: 'DifferentPassword1',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it('rejects unaccepted terms', () => {
    const res = emailSignupSchema.safeParse({
      ...validSignup,
      termsAccepted: false,
    });
    expect(res.success).toBe(false);
  });
});
