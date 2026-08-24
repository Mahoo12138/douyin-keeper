import { useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { listAccounts } from '@douyin-keeper/sdk-ts'

export function useAccountsQuery(token: string | null, options?: { loadAll?: boolean }) {
  const loadAll = options?.loadAll ?? false
  const query = useInfiniteQuery({
    queryKey: ['accounts'],
    queryFn: ({ pageParam }) => listAccounts(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })

  useEffect(() => {
    if (!loadAll || !query.hasNextPage || query.isFetchingNextPage) return
    void query.fetchNextPage()
  }, [loadAll, query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage])

  return {
    ...query,
    accounts: query.data?.pages.flatMap((page) => page.items) ?? [],
  }
}
