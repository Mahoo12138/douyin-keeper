import { NextRequest, NextResponse } from 'next/server';
import { pricingAdminService } from '@libs/pricing';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { planOrders } = body as { planOrders: { id: string; sortOrder: number }[] };

    if (!planOrders || !Array.isArray(planOrders)) {
      return NextResponse.json(
        { error: 'Missing required field: planOrders (array of { id, sortOrder })' },
        { status: 400 }
      );
    }

    await pricingAdminService.reorderPlans(planOrders);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering pricing plans:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
