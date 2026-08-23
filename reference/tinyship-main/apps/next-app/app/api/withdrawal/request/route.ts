import { auth } from '@libs/auth';
import { requestWithdrawal } from '@libs/affiliate';
import { withdrawalRequestSchema } from '@libs/validators';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: new Headers(request.headers) });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = withdrawalRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 });
    }

    const { amount, paymentMethod, paymentAccount } = parsed.data;

    const result = await requestWithdrawal({
      userId: session.user.id,
      amount,
      paymentMethod,
      paymentAccount,
    });

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    console.error('Failed to request withdrawal:', error);
    return Response.json({ error: 'Failed to request withdrawal' }, { status: 500 });
  }
}
