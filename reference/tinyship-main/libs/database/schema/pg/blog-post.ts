import { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./user";
import { blogPostStatus } from "../../constants";

export { blogPostStatus };
export type { BlogPostStatus } from "../../constants";

export const blogPost = pgTable("blog_post", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt"),
  coverImage: text("cover_image"),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default(blogPostStatus.DRAFT),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata"),
}, (table) => [
  uniqueIndex("blog_post_slug_idx").on(table.slug),
]);

export type BlogPost = InferSelectModel<typeof blogPost>;
export type NewBlogPost = InferInsertModel<typeof blogPost>;
