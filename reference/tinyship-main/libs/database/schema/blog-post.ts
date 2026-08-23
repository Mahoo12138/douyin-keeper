import { getDialect } from '../shared/dialect';
import * as pgSchema from './pg/blog-post';
import * as sqliteSchema from './sqlite/blog-post';

export type { BlogPost, NewBlogPost } from './pg/blog-post';
export type { BlogPostStatus } from '../constants';
export { blogPostStatus } from '../constants';

const _impl = ((getDialect() === 'sqlite' || getDialect() === 'd1') ? sqliteSchema : pgSchema) as typeof pgSchema;
export const blogPost = _impl.blogPost;
