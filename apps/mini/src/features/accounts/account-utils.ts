export function visibleMiniAccounts<T extends { binding_status: string }>(accounts: readonly T[]) {
  return accounts.filter((account) => account.binding_status === 'binding' || account.binding_status === 'bound')
}
