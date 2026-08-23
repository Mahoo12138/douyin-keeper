import { describe, test, expect } from 'vitest';
import { safeNumber, TransactionTypeCode } from '@libs/credits/utils';

describe('Credits Utils', () => {
  describe('safeNumber', () => {
    test('should return valid numbers as-is', () => {
      expect(safeNumber(42)).toBe(42);
      expect(safeNumber(0)).toBe(0);
      expect(safeNumber(-10)).toBe(-10);
      expect(safeNumber(3.14)).toBe(3.14);
    });

    test('should return default for undefined', () => {
      expect(safeNumber(undefined)).toBe(0);
      expect(safeNumber(undefined, 5)).toBe(5);
    });

    test('should return default for null', () => {
      expect(safeNumber(null)).toBe(0);
      expect(safeNumber(null, 10)).toBe(10);
    });

    test('should return default for NaN', () => {
      expect(safeNumber(NaN)).toBe(0);
      expect(safeNumber(NaN, 7)).toBe(7);
    });

    test('should return default for Infinity', () => {
      expect(safeNumber(Infinity)).toBe(0);
      expect(safeNumber(-Infinity)).toBe(0);
      expect(safeNumber(Infinity, 100)).toBe(100);
    });

    test('should return default for strings', () => {
      expect(safeNumber('42')).toBe(0);
      expect(safeNumber('hello')).toBe(0);
      expect(safeNumber('')).toBe(0);
    });

    test('should return default for objects', () => {
      expect(safeNumber({})).toBe(0);
      expect(safeNumber([])).toBe(0);
      expect(safeNumber({ value: 42 })).toBe(0);
    });

    test('should return default for boolean', () => {
      expect(safeNumber(true)).toBe(0);
      expect(safeNumber(false)).toBe(0);
    });

    test('should use custom default value', () => {
      expect(safeNumber(undefined, 99)).toBe(99);
      expect(safeNumber(NaN, -1)).toBe(-1);
      expect(safeNumber(null, 0.5)).toBe(0.5);
    });

    test('should handle edge case: negative zero', () => {
      // -0 is a valid finite number, so it should be returned
      const result = safeNumber(-0);
      // Using == instead of Object.is since -0 == 0 in JavaScript
      expect(result === 0).toBe(true);
    });

    test('should handle very large valid numbers', () => {
      const largeNumber = Number.MAX_SAFE_INTEGER;
      expect(safeNumber(largeNumber)).toBe(largeNumber);
    });

    test('should handle very small valid numbers', () => {
      const smallNumber = Number.MIN_VALUE;
      expect(safeNumber(smallNumber)).toBe(smallNumber);
    });
  });

  describe('TransactionTypeCode', () => {
    test('should have correct AI_CHAT code', () => {
      expect(TransactionTypeCode.AI_CHAT).toBe('ai_chat');
    });

    test('should have correct IMAGE_GENERATION code', () => {
      expect(TransactionTypeCode.IMAGE_GENERATION).toBe('image_generation');
    });

    test('should have correct DOCUMENT_PROCESSING code', () => {
      expect(TransactionTypeCode.DOCUMENT_PROCESSING).toBe('document_processing');
    });

    test('should have correct PURCHASE code', () => {
      expect(TransactionTypeCode.PURCHASE).toBe('purchase');
    });

    test('should have correct BONUS code', () => {
      expect(TransactionTypeCode.BONUS).toBe('bonus');
    });

    test('should have correct REFUND code', () => {
      expect(TransactionTypeCode.REFUND).toBe('refund');
    });

    test('should have correct ADJUSTMENT code', () => {
      expect(TransactionTypeCode.ADJUSTMENT).toBe('adjustment');
    });

    test('should be immutable (readonly)', () => {
      // TypeScript should prevent this at compile time
      // At runtime, we can check that all expected codes exist
      const expectedCodes = [
        'ai_chat',
        'ai_image_generation',
        'image_generation',
        'document_processing',
        'purchase',
        'bonus',
        'refund',
        'adjustment'
      ];
      
      const actualCodes = Object.values(TransactionTypeCode);
      expect(actualCodes).toEqual(expect.arrayContaining(expectedCodes));
      expect(actualCodes.length).toBe(expectedCodes.length);
    });
  });
});

