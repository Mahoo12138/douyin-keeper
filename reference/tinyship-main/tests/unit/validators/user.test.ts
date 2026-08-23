import { describe, expect, it } from 'vitest';
import {
  userSchema,
  emailSignUpSchema,
  phoneSignUpSchema,
  updateUserSchema,
  userIdSchema,
  loginFormSchema,
  signupFormSchema,
} from '@libs/validators/user';
import { userRoles } from '@libs/database/constants';

describe('User Validators', () => {
  describe('userSchema', () => {
    it('should validate a valid user', () => {
      const validUser = {
        name: 'John Doe',
        email: 'john@example.com',
        emailVerified: false,
        role: userRoles.USER,
        phoneNumber: '13800138000',
        phoneNumberVerified: false,
      };

      const result = userSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid email', () => {
      const invalidUser = {
        name: 'John Doe',
        email: 'invalid-email',
        emailVerified: false,
      };

      const result = userSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });

    it('should fail with too short name', () => {
      const invalidUser = {
        name: 'J',
        email: 'john@example.com',
        emailVerified: false,
      };

      const result = userSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });

  describe('emailSignUpSchema', () => {
    it('should validate valid email signup', () => {
      const validSignup = {
        name: 'John Doe',
        email: 'test@example.com',
        password: 'password123',
      };

      const result = emailSignUpSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it('should fail with short password', () => {
      const invalidSignup = {
        name: 'John Doe',
        email: 'test@example.com',
        password: '12345',
      };

      const result = emailSignUpSchema.safeParse(invalidSignup);
      expect(result.success).toBe(false);
    });

    it('should fail with invalid email', () => {
      const invalidSignup = {
        name: 'John Doe',
        email: 'invalid-email',
        password: 'password123',
      };

      const result = emailSignUpSchema.safeParse(invalidSignup);
      expect(result.success).toBe(false);
    });
  });

  describe('phoneSignUpSchema', () => {
    it('should validate valid phone signup', () => {
      const validSignup = {
        phoneNumber: '13800138000',
        code: '123456',
      };

      const result = phoneSignUpSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid phone number length', () => {
      const invalidSignup = {
        phoneNumber: '138001380',  // 少一位
        code: '123456',
      };

      const result = phoneSignUpSchema.safeParse(invalidSignup);
      expect(result.success).toBe(false);
    });

    it('should fail with invalid code length', () => {
      const invalidSignup = {
        phoneNumber: '13800138000',
        code: '12345',  // 少一位
      };

      const result = phoneSignUpSchema.safeParse(invalidSignup);
      expect(result.success).toBe(false);
    });
  });

  describe('loginFormSchema', () => {
    it('should validate valid login form data', () => {
      const validLogin = {
        email: 'test@example.com',
        password: 'password123',
        remember: true,
      };

      const result = loginFormSchema.safeParse(validLogin);
      expect(result.success).toBe(true);
    });

    it('should validate login form without remember field', () => {
      const validLogin = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = loginFormSchema.safeParse(validLogin);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.remember).toBe(false);
      }
    });

    it('should fail with invalid email', () => {
      const invalidLogin = {
        email: 'invalid-email',
        password: 'password123',
      };

      const result = loginFormSchema.safeParse(invalidLogin);
      expect(result.success).toBe(false);
    });

    it('should fail with short password', () => {
      const invalidLogin = {
        email: 'test@example.com',
        password: '123',
      };

      const result = loginFormSchema.safeParse(invalidLogin);
      expect(result.success).toBe(false);
    });
  });

  describe('signupFormSchema', () => {
    it('should validate valid signup form data with image', () => {
      const validSignup = {
        name: 'John Doe',
        email: 'test@example.com',
        password: 'password123',
        image: 'https://example.com/image.jpg',
      };

      const result = signupFormSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it('should validate signup form without image', () => {
      const validSignup = {
        name: 'John Doe',
        email: 'test@example.com',
        password: 'password123',
      };

      const result = signupFormSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it('should validate signup form with empty image string', () => {
      const validSignup = {
        name: 'John Doe',
        email: 'test@example.com',
        password: 'password123',
        image: '',
      };

      const result = signupFormSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it('should fail with invalid image URL', () => {
      const invalidSignup = {
        name: 'John Doe',
        email: 'test@example.com',
        password: 'password123',
        image: 'not-a-url',
      };

      const result = signupFormSchema.safeParse(invalidSignup);
      expect(result.success).toBe(false);
    });
  });

  describe('updateUserSchema', () => {
    it('should allow partial updates', () => {
      const partialUpdate = {
        name: 'New Name',
      };

      const result = updateUserSchema.safeParse(partialUpdate);
      expect(result.success).toBe(true);
    });

    it('should validate field types when provided', () => {
      const invalidUpdate = {
        email: 'invalid-email',
      };

      const result = updateUserSchema.safeParse(invalidUpdate);
      expect(result.success).toBe(false);
    });
  });

  describe('userIdSchema', () => {
    it('should validate valid id', () => {
      const validId = {
        id: '123',
      };

      const result = userIdSchema.safeParse(validId);
      expect(result.success).toBe(true);
    });

    it('should fail with empty id', () => {
      const invalidId = {
        id: '',
      };

      const result = userIdSchema.safeParse(invalidId);
      expect(result.success).toBe(false);
    });
  });
}); 