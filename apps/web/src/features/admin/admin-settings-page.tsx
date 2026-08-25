import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Plus, RefreshCw, Save, Settings2 } from 'lucide-react'
import type { components } from '@douyin-keeper/sdk-ts'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Skeleton } from '@douyin-keeper/ui-web'

import { listAdminSettings, updateAdminSetting } from '@douyin-keeper/sdk-ts'
import { getToken } from '@/auth/session'
import { formatSettingValue, isSettingKeyValid, parseSettingValue } from './admin-settings-utils'

type Setting = components['schemas']['AdminSetting']

export function AdminSettingsPage() {
	const token = getToken()
	const queryClient = useQueryClient()
	const [editingKey, setEditingKey] = useState<string | null>(null)
	const [formOpen, setFormOpen] = useState(false)
	const [key, setKey] = useState('')
	const [value, setValue] = useState('{}')
	const [formError, setFormError] = useState<string | null>(null)
	const settingsQ = useQuery({ queryKey: ['admin-settings'], queryFn: () => listAdminSettings(token as string), enabled: !!token })
	const updateMutation = useMutation({
		mutationFn: ({ settingKey, settingValue }: { settingKey: string; settingValue: unknown }) => updateAdminSetting(token as string, settingKey, settingValue),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['admin-settings'] })
			toast.success('站点设置已保存')
			resetForm()
		},
	})
	const settings = settingsQ.data?.items ?? []

	function resetForm() {
		setFormOpen(false)
		setEditingKey(null)
		setKey('')
		setValue('{}')
		setFormError(null)
	}

	function editSetting(setting: Setting) {
		setFormOpen(true)
		setEditingKey(setting.key)
		setKey(setting.key)
		setValue(formatSettingValue(setting.value))
		setFormError(null)
	}

	function openNewSetting() {
		setEditingKey(null)
		setKey('')
		setValue('{}')
		setFormError(null)
		setFormOpen(true)
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const normalizedKey = key.trim().toLowerCase()
		if (!isSettingKeyValid(normalizedKey)) {
			setFormError('配置键需使用小写字母开头的安全标识符，且不能包含密码、Token、Cookie 等敏感字段。')
			return
		}
		const parsed = parseSettingValue(value)
		if (parsed.error) {
			setFormError(parsed.error)
			return
		}
		setFormError(null)
		updateMutation.mutate({ settingKey: normalizedKey, settingValue: parsed.value })
	}

	return <div className="space-y-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">控制台 · 配置</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">站点设置</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">维护站点模块使用的 JSON 配置。更新动作会记录配置键，但审计日志不会保存具体配置值。</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void settingsQ.refetch()} disabled={settingsQ.isFetching}><RefreshCw />重新加载</Button><Button onClick={openNewSetting}><Plus />新增配置</Button></div></div>{updateMutation.isError && <Card className="border-destructive/40"><CardContent className="py-4 text-sm text-destructive">设置保存失败，请检查配置键、JSON 格式或管理员权限后重试。</CardContent></Card>}<Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{editingKey ? '编辑配置' : '新增配置'}</DialogTitle><DialogDescription>单个配置值最大 16 KB；敏感凭据不应存入站点设置。</DialogDescription></DialogHeader><form className="space-y-5 px-6 py-6" onSubmit={submit}><div className="space-y-1.5"><Label htmlFor="admin-setting-key">配置键</Label><Input id="admin-setting-key" value={key} disabled={!!editingKey} onChange={(event) => setKey(event.target.value)} placeholder="例如 feature.notice" autoComplete="off" /><p className="text-xs text-muted-foreground">只允许小写字母、数字、点、短横线和下划线。</p></div><div className="space-y-1.5"><Label htmlFor="admin-setting-value">JSON 配置值</Label><textarea id="admin-setting-value" value={value} onChange={(event) => setValue(event.target.value)} rows={9} spellCheck={false} className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" placeholder={'{"enabled":true}'} /></div>{formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}<DialogFooter className="-mx-6 -mb-6"><Button type="button" variant="outline" onClick={resetForm} disabled={updateMutation.isPending}>取消</Button><Button type="submit" disabled={updateMutation.isPending}><Save />{updateMutation.isPending ? '保存中…' : '保存配置'}</Button></DialogFooter></form></DialogContent></Dialog><Card><CardHeader><CardTitle>已保存配置</CardTitle><CardDescription>{settings.length ? `共 ${settings.length} 项；按配置键排序。` : '尚未保存任何站点配置。'}</CardDescription></CardHeader><CardContent>{settingsQ.isPending ? <SettingsLoading /> : settingsQ.isError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-10 text-center"><p className="font-medium">配置暂时不可用</p><Button className="mt-4" variant="outline" onClick={() => void settingsQ.refetch()}>重试</Button></div> : settings.length ? <div className="space-y-3">{settings.map((setting) => <SettingRow key={setting.key} setting={setting} onEdit={() => editSetting(setting)} />)}</div> : <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center"><Settings2 className="size-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">暂无站点配置</p><Button className="mt-4" variant="outline" size="sm" onClick={openNewSetting}><Plus />添加第一项</Button></div>}</CardContent></Card></div>
}

function SettingRow({ setting, onEdit }: { setting: Setting; onEdit: () => void }) {
	return <div className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{setting.key}</p><p className="mt-1 text-xs text-muted-foreground">更新于 {formatDate(setting.updated_at)}</p></div><Button variant="ghost" size="sm" onClick={onEdit}><Pencil />编辑</Button></div><pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-5">{formatSettingValue(setting.value)}</pre></div>
}

function SettingsLoading() {
	return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
