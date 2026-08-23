import { auth } from '@libs/auth';
import { processWithdrawal } from '@libs/affiliate';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: new Headers(request.headers) });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: withdrawalId } = await params;
    const { status, adminNote } = await request.json();

    if (!status || !['processing', 'completed', 'rejected'].includes(status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }

    const result = await processWithdrawal({
      withdrawalId,
      status,
      adminNote,
      processedBy: session.user.id,
    });

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json(result);
  } catch (error) {
    console.error('Failed to process withdrawal:', error);
    return Response.json({ error: 'Failed to process withdrawal' }, { status: 500 });
  }
}
