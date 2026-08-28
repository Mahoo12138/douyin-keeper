export function redeemErrorMessage(code: string, message: string, fallback = '卡密兑换失败，请稍后重试。') {
  if ((code === 'CONFLICT' && message.toLowerCase().includes('invalid card code')) || code === 'NOT_FOUND') {
    return '卡密无效或不存在，请检查后重试。'
  }
  if (code === 'CODE_ALREADY_REDEEMED') return '该卡密已被兑换，请更换其他卡密。'
  if (code === 'ENTITLEMENT_PLAN_CONFLICT') return '该权益无法与当前权益叠加，请先查看当前权益。'
  return fallback
}
