import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Card, // 注册 shadcn 的 Card 组件
    CardHeader,
    CardTitle,
    CardContent,
    ...components,
  };
}
