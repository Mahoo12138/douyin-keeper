import { NextRequest, NextResponse } from 'next/server';
import { getActivePlans, getPlansForLocale } from '@libs/pricing';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get('locale') || 'en';

    const allPlans = await getActivePlans();
    const plans = getPlansForLocale(allPlans, locale);

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Error fetching pricing plans:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
