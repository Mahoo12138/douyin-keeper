import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./user";
import { blogPostStatus } from "../../constants";

export { blogPostStatus };
export type { BlogPostStatus } from "../../constants";

export const blogPost = sqliteTable("blog_post", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt"),
  coverImage: text("cover_image"),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default(blogPostStatus.DRAFT),
  publishedAt: integer("published_at", { mode: 'timestamp' }),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  metadata: text("metadata", { mode: 'json' }),
}, (table) => [
  uniqueIndex("blog_post_slug_idx").on(table.slug),
]);

export type BlogPost = InferSelectModel<typeof blogPost>;
export type NewBlogPost = InferInsertModel<typeof blogPost>;
