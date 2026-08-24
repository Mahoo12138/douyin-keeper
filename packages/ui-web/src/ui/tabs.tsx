import { createContext, useContext, useId, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'

import { cn } from '../lib'

type TabsContextValue = {
  value: string
  onValueChange: (value: string) => void
  id: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

export function getNextTabIndex(currentIndex: number, tabCount: number, key: string) {
  if (tabCount <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return tabCount - 1
  if (key === 'ArrowRight' || key === 'ArrowDown') return (currentIndex + 1) % tabCount
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (currentIndex - 1 + tabCount) % tabCount
  return currentIndex
}

export function Tabs({ value, onValueChange, id, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { value: string; onValueChange: (value: string) => void; id?: string; children: ReactNode }) {
  const generatedId = useId().replaceAll(':', '')
  return <TabsContext.Provider value={{ value, onValueChange, id: id ?? `tabs-${generatedId}` }}><div id={id} className={cn('space-y-4', className)} {...props}>{children}</div></TabsContext.Provider>
}

export function TabsList({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)} {...props}>{children}</div>
}

export function TabsTrigger({ value, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsTrigger must be used inside Tabs')
  const tabsContext = context
  const selected = tabsContext.value === value
  const tabId = `${tabsContext.id}-tab-${value}`
  const panelId = `${tabsContext.id}-panel-${value}`

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['Home', 'End', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return
    const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    const currentIndex = tabs.indexOf(event.currentTarget)
    const nextIndex = getNextTabIndex(currentIndex, tabs.length, event.key)
    if (nextIndex < 0 || nextIndex === currentIndex) return
    event.preventDefault()
    tabs[nextIndex]?.focus()
    const nextValue = tabs[nextIndex]?.dataset.tabValue
    if (nextValue) tabsContext.onValueChange(nextValue)
  }

  return <button type="button" role="tab" id={tabId} data-tab-value={value} aria-selected={selected} aria-controls={panelId} tabIndex={selected ? 0 : -1} className={cn('shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm text-muted-foreground outline-none transition-colors hover:border-border hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', selected && 'border-primary font-medium text-foreground', className)} {...props} onClick={() => tabsContext.onValueChange(value)} onKeyDown={handleKeyDown}>{children}</button>
}

export function TabsContent({ value, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsContent must be used inside Tabs')
  const selected = context.value === value
  return <div role="tabpanel" id={`${context.id}-panel-${value}`} aria-labelledby={`${context.id}-tab-${value}`} hidden={!selected} tabIndex={0} className={cn('outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)} {...props}>{children}</div>
}
