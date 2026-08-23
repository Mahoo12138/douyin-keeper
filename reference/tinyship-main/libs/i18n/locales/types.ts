// 简化的i18n类型定义
// 不再需要手动维护庞大的类型定义，而是基于实际的翻译对象自动推断类型

// 深度嵌套对象的路径类型（用于类型安全的翻译函数）
export type DeepKeys<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${DeepKeys<T[K]>}`
          : K
        : never
    }[keyof T]
  : never

// 根据路径获取值的类型
export type DeepValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? DeepValue<T[K], Rest>
    : never
  : P extends keyof T
  ? T[P]
  : never

// 翻译路径类型
export type TranslationPath<T> = DeepKeys<T>

// 翻译值类型
export type TranslationValue<T, P extends TranslationPath<T>> = DeepValue<T, P>

// 基础翻译对象类型 - 这将在运行时由英文翻译对象推断
export type Locale = Record<string, any> 