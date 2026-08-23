/**
 * 获取UTC时间的简单工具函数
 */

/**
 * 获取当前UTC时间
 * 消除服务器时区影响，确保与webhook时间一致
 */
export function utcNow(): Date {
  return new Date(Date.now()); // Date.now()返回UTC毫秒数
}
