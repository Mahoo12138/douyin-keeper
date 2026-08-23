import { auth } from '@libs/auth';
import { applyReferralCodeToUser, getReferralCodeFromCookieHeader } from '@libs/affiliate';
import { config } from '@config';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: new Headers(request.headers) });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cookieHeader = request.headers.get('cookie');
    const referralCode = getReferralCodeFromCookieHeader(cookieHeader, config.affiliate.cookie.name);

    const result = await applyReferralCodeToUser({
      userId: session.user.id,
      referralCode,
    });

    const response = Response.json(result);

    if (result.applied) {
      response.headers.set('Set-Cookie', `${config.affiliate.cookie.name}=; Path=/; Max-Age=0`);
    }

    return response;
  } catch (error) {
    console.error('Failed to claim referral:', error);
    return Response.json({ error: 'Failed to claim referral' }, { status: 500 });
  }
}
