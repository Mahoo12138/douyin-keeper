export function accountTabLabel(account: { id: string; nickname?: string | null; binding_status?: string }) {
  if (account.nickname) return account.nickname
  const shortId = account.id.slice(0, 6)
  return account.binding_status === 'binding' ? `绑定中 · ${shortId}` : `未命名账号 · ${shortId}`
}
