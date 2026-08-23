import { NextRequest, NextResponse } from 'next/server';
import { pricingAdminService } from '@libs/pricing';
import type { CreatePlanInput, UpdatePlanInput } from '@libs/pricing';
import { config } from '@config';

export async function GET() {
  try {
    const plans = await pricingAdminService.getAllPlans();
    return NextResponse.json({ plans, pricingMode: config.payment.pricingMode });
  } catch (error) {
    console.error('Error fetching pricing plans:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreatePlanInput;

    if (!body.provider || !body.amount || !body.currency || !body.durationType || !body.i18n) {
      return NextResponse.json(
        { error: 'Missing required fields: provider, amount, currency, durationType, i18n' },
        { status: 400 }
      );
    }

    const plan = await pricingAdminService.createPlan(body);
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error('Error creating pricing plan:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as UpdatePlanInput;

    if (!body.id) {
      return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    }

    const plan = await pricingAdminService.updatePlan(body);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Error updating pricing plan:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const hard = searchParams.get('hard') === 'true';

    if (!id) {
      return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
    }

    const success = hard
      ? await pricingAdminService.hardDeletePlan(id)
      : await pricingAdminService.deletePlan(id);

    if (!success) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pricing plan:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
