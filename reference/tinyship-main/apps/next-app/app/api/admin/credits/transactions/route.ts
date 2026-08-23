import { NextRequest, NextResponse } from 'next/server';
import { creditService } from '@libs/credits/service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    console.log('Credits transactions API called with params:', Object.fromEntries(searchParams.entries()));
    
    // Pagination parameters
    const limit = parseInt(searchParams.get('limit') || '10');
    const page = parseInt(searchParams.get('page') || '1');
    
    // Search parameters
    const searchField = searchParams.get('searchField') || undefined;
    const searchValue = searchParams.get('searchValue') || undefined;
    
    // Filter parameters
    const type = searchParams.get('type') || undefined;
    const userId = searchParams.get('userId') || undefined;
    
    // Sort parameters
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortDirection = (searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc';

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
    });

    return NextResponse.json({
      transactions: result.transactions,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages
    });

  } catch (error) {
    console.error('Error fetching credit transactions:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

