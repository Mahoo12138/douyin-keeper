import { user } from '../database/schema/user';
import { InferSelectModel } from 'drizzle-orm';

/**
 * 定义系统中的用户角色
 */
export enum Role {
  NORMAL = 'normal',
  VIP = 'vip',
  ADMIN = 'admin'
}

/**
 * 定义系统中可以受到权限控制的资源
 */
export enum Subject {
  ALL = 'all',
  USER = 'user',
  PROJECT = 'project',
  SUBSCRIPTION = 'subscription',
  REPORT = 'report',
  SETTING = 'setting'
}

/**
 * 定义系统中的操作类型
 */
export enum Action {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage' // 特殊操作：可以执行所有操作
}

/**
 * 用户类型定义
 */
export type User = InferSelectModel<typeof user>;

/**
 * 用户类型扩展
 */
export type AppUser = User & {
  role: Role;
}; 