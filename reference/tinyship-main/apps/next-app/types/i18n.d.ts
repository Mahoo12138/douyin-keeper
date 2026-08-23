import { translations } from '@libs/i18n';

export type Translations = typeof translations.en;
export type TranslationKey = keyof Translations;

// 递归获取所有可能的翻译路径
export type TranslationPath<T> = T extends string
  ? []
  : {
      [K in keyof T]: [K, ...TranslationPath<T[K]>];
    }[keyof T];

// 根据路径获取翻译值的类型
export type TranslationValue<
  T,
  Path extends readonly unknown[]
> = Path extends readonly [infer First, ...infer Rest]
  ? First extends keyof T
    ? Rest extends readonly unknown[]
      ? TranslationValue<T[First], Rest>
      : never
    : never
  : T; 