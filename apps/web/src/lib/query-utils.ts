export function flattenPageItems<T>(pages: Array<{ items?: Array<T | null> | null } | null | undefined>) {
  return pages.flatMap((page) => Array.isArray(page?.items) ? page.items.filter((item): item is T => item != null) : [])
}
