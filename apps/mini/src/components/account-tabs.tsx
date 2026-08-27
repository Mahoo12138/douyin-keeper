import { View } from '@tarojs/components'

import { MiniButton as Button } from './mini-button'

export type AccountTabItem = { id: string; nickname?: string | null }

export function AccountTabs({ accounts, selectedId, onSelect, disabled = false }: { accounts: readonly AccountTabItem[]; selectedId: string; onSelect: (id: string) => void; disabled?: boolean }) {
  return <View className="account-tabs">{accounts.map((account) => <Button key={account.id} className={`account-tab ${account.id === selectedId ? 'account-tab-active' : ''}`} disabled={disabled} onClick={() => onSelect(account.id)}>{account.nickname || '未命名账号'}</Button>)}</View>
}
