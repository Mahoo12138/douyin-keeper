// Export user validators (maintain backward compatibility)
export { 
  createValidators,
  createValidators as createUserValidators, 
  countryCodes,
  getCountriesWithNames,
  type CountryCode 
} from './user';

// Export admin user validators
export { createAdminUserValidators } from './admin-user';

// Export blog post validators
export { createBlogPostValidators } from './blog-post';

// Export withdrawal validators
export { createWithdrawalValidators, withdrawalRequestSchema } from './withdrawal';

// 为 Next.js 创建支持参数插值的翻译函数工厂
export function createNextTranslationFunction(translations: any) {
  return (key: string, params?: Record<string, any>) => {
    // 获取嵌套对象中的值
    const value = key.split('.').reduce((obj, path) => obj?.[path], translations);
    
    // 如果没有参数或值不是字符串，直接返回
    if (!params || typeof value !== 'string') {
      return value;
    }
    
    // 替换参数占位符
    return Object.entries(params).reduce((message, [key, value]) => {
      return message.replace(`{${key}}`, String(value));
    }, value);
  };
} 
