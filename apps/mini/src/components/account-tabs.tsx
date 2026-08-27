import { View } from '@tarojs/components'

import { MiniButton as Button } from './mini-button'
import { accountTabLabel } from './account-tab-utils'

export type AccountTabItem = { id: string; nickname?: string | null; binding_status?: string }

export function AccountTabs({ accounts, selectedId, onSelect, disabled = false }: { accounts: readonly AccountTabItem[]; selectedId: string; onSelect: (id: string) => void; disabled?: boolean }) {
  return <View className="account-tabs">{accounts.map((account) => <Button key={account.id} className={`account-tab ${account.id === selectedId ? 'account-tab-active' : ''}`} disabled={disabled} onClick={() => onSelect(account.id)}>{accountTabLabel(account)}</Button>)}</View>
}
