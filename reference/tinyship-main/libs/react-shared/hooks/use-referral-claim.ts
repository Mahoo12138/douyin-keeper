'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface ReferralClaimMessages {
  bonusFailed?: string;
  claimFailed?: string;
}

/**
 * Auto-claim referral code from cookie on first mount.
 * Should be used in a component that only renders for authenticated users (e.g. dashboard).
 */
export function useReferralClaim(messages?: ReferralClaimMessages) {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const hasCookie = document.cookie.split(';').some(c => c.trim().startsWith('referral_code='));
    if (!hasCookie) return;

    fetch('/api/affiliate/claim', { method: 'POST', credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.applied) {
          console.info('[Affiliate] Referral code claimed successfully');
          if (data.bonusGranted === false) {
            toast.error(messages?.bonusFailed || 'Referral applied, but signup bonus could not be granted.');
          }
        }
      })
      .catch(err => {
        console.warn('[Affiliate] Failed to claim referral code:', err);
        toast.error(messages?.claimFailed || 'Failed to claim referral code.');
      });
  }, []);
}
