import { NextResponse } from 'next/server';
import { config } from '@config';
import { pricingAdminService } from '@libs/pricing';

export async function POST() {
  try {
    const count = await pricingAdminService.importFromStaticConfig(
      config.payment.plans as unknown as Record<string, any>
    );
    return NextResponse.json({ success: true, imported: count });
  } catch (error) {
    console.error('Error importing static plans:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
