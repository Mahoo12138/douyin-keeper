import { creditService } from '@libs/credits/service'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    console.log('Credits transactions API called with params:', query)
    
    // Pagination parameters
    const limit = parseInt(String(query.limit || '10')) || 10
    const page = parseInt(String(query.page || '1')) || 1
    
    // Search parameters
    const searchField = query.searchField ? String(query.searchField) : undefined
    const searchValue = query.searchValue ? String(query.searchValue) : undefined
    
    // Filter parameters
    const type = query.type ? String(query.type) : undefined
    const userId = query.userId ? String(query.userId) : undefined
    
    // Sort parameters
    const sortBy = query.sortBy ? String(query.sortBy) : 'createdAt'
    const sortDirection = (query.sortDirection as 'asc' | 'desc') || 'desc'

    // Call service method
    const result = await creditService.getAllTransactionsPaginated({
      page,
      limit,
      searchField,
      searchValue,
      type: type as any,
      userId,
      sortBy,
      sortDirection
    })

    return {
      transactions: result.transactions,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages
    }
  } catch (error) {
    console.error('Error fetching credit transactions:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error'
    })
  }
})

