import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Bell, Check, KeyRound, ShieldCheck, UserRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { ApiError, changePassword, getNotificationPreferences, me, updateNotificationPreferences } from '@douyin-keeper/sdk-ts'
import type { components } from '@douyin-keeper/sdk-ts'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton } from '@douyin-keeper/ui-web'

import { getToken, setToken } from '@/auth/session'
import { changePasswordSchema } from './password-validation'
import type { ChangePasswordForm } from './password-validation'
import { formatPreferenceUpdatedAt, notificationPreferenceLabel } from './settings-utils'

type NotificationPreferences = components['schemas']['NotificationPreferences']

export function SettingsPage() {
	const token = getToken()
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const passwordForm = useForm<ChangePasswordForm>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
	})
	const identityQ = useQuery({ queryKey: ['me', token], queryFn: () => me(token as string), enabled: !!token })
	const preferencesQ = useQuery({ queryKey: ['notification-preferences', token], queryFn: () => getNotificationPreferences(token as string), enabled: !!token })
	const disableWechatMutation = useMutation({
		mutationFn: () => updateNotificationPreferences(token as string, false),
		onSuccess: (data) => {
			queryClient.setQueryData(['notification-preferences', token], data)
			toast.success('微信通知已关闭')
		},
	})
	const changePasswordMutation = useMutation({
		mutationFn: (values: ChangePasswordForm) => changePassword(token as string, {
			current_password: values.currentPassword,
			new_password: values.newPassword,
		}),
		onSuccess: () => {
			passwordForm.reset()
			setToken(null)
			queryClient.clear()
			toast.success('密码已修改，请使用新密码重新登录')
			void navigate({ to: '/signin', replace: true })
		},
	})

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-semibold tracking-tight">设置</h1>
				<p className="mt-2 text-sm text-muted-foreground">管理账号信息、通知偏好和登录安全边界。</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><UserRound className="size-5 text-primary" />账号信息</CardTitle>
					<CardDescription>当前登录身份由统一 Web 会话保护。</CardDescription>
				</CardHeader>
				<CardContent>
					{identityQ.isPending ? <div className="space-y-3"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-64" /></div> : identityQ.isError ? <SettingsError text="账号信息暂时不可用" onRetry={() => void identityQ.refetch()} /> : <div className="grid gap-4 sm:grid-cols-2"><InfoItem label="显示名称" value={identityQ.data?.display_name || '未设置'} /><InfoItem label="账号角色" value={identityQ.data?.role === 'admin' ? '管理员' : '普通用户'} /></div>}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-primary" />修改密码</CardTitle>
					<CardDescription>修改成功后会退出所有设备，保护账号安全。</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="flex max-w-xl flex-col gap-4" onSubmit={passwordForm.handleSubmit((values) => changePasswordMutation.mutate(values))}>
						<PasswordField id="current-password" label="当前密码" autoComplete="current-password" error={passwordForm.formState.errors.currentPassword?.message} registration={passwordForm.register('currentPassword')} />
						<PasswordField id="new-password" label="新密码" autoComplete="new-password" hint="使用至少 8 个字符，且不要与当前密码相同。" error={passwordForm.formState.errors.newPassword?.message} registration={passwordForm.register('newPassword')} />
						<PasswordField id="confirm-password" label="确认新密码" autoComplete="new-password" error={passwordForm.formState.errors.confirmPassword?.message} registration={passwordForm.register('confirmPassword')} />
						{changePasswordMutation.isError ? <p className="text-sm text-destructive" role="alert">{passwordChangeError(changePasswordMutation.error)}</p> : null}
						<div><Button type="submit" disabled={changePasswordMutation.isPending}>{changePasswordMutation.isPending ? '修改中…' : '修改密码'}</Button></div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><Bell className="size-5 text-primary" />微信服务通知</CardTitle>
					<CardDescription>登录失效和安全验证会通过微信提醒；站内通知始终保留。</CardDescription>
				</CardHeader>
				<CardContent>
					{preferencesQ.isPending ? <div className="space-y-3"><Skeleton className="h-6 w-32" /><Skeleton className="h-4 w-full max-w-xl" /></div> : preferencesQ.isError ? <SettingsError text="通知偏好暂时不可用" onRetry={() => void preferencesQ.refetch()} /> : <><NotificationPreference preferences={preferencesQ.data as NotificationPreferences} pending={disableWechatMutation.isPending} onDisable={() => disableWechatMutation.mutate()} />{disableWechatMutation.isError && <p className="mt-3 text-sm text-destructive">关闭微信通知失败，请稍后重试。</p>}</>}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />登录与隐私</CardTitle>
					<CardDescription>设置页只展示必要的账号状态，不暴露平台 Session、Cookie 或其他凭据。</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
					<p>需要退出当前设备时，请使用右上角用户菜单中的“退出登录”。</p>
					<Button asChild variant="outline"><Link to="/notifications">查看站内通知<ArrowRight /></Link></Button>
				</CardContent>
			</Card>
		</div>
	)
}

function PasswordField({ id, label, hint, error, autoComplete, registration }: { id: string; label: string; hint?: string; error?: string; autoComplete: string; registration: UseFormRegisterReturn }) {
	return <div className="flex flex-col gap-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} type="password" autoComplete={autoComplete} aria-invalid={!!error} {...registration} />{error ? <p className="text-sm text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>
}

function passwordChangeError(error: unknown) {
	if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') return '当前密码不正确，请重新输入。'
	if (error instanceof ApiError && error.code === 'CONFLICT') return '新密码不符合要求，请检查后重试。'
	return '密码修改失败，请稍后重试。'
}

function NotificationPreference({ preferences, pending, onDisable }: { preferences: NotificationPreferences; pending: boolean; onDisable: () => void }) {
	if (preferences.wechat_enabled) {
		return <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Badge variant="success"><Check />已开启</Badge><span className="text-sm font-medium">{notificationPreferenceLabel(true)}</span></div><p className="mt-2 text-sm text-muted-foreground">授权更新时间：{formatPreferenceUpdatedAt(preferences.updated_at)}</p></div><Button variant="outline" onClick={onDisable} disabled={pending}>{pending ? '处理中…' : '关闭微信通知'}</Button></div>
	}

	return <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Badge variant="muted">未开启</Badge><span className="text-sm font-medium">{notificationPreferenceLabel(false)}</span></div><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">打开微信小程序“我的”→“微信服务通知”完成授权。Web 端不会伪造微信订阅授权，风险提醒仍会保留在站内通知。</p></div><Button asChild variant="outline"><Link to="/notifications">打开通知中心<Bell /></Link></Button></div>
}

function InfoItem({ label, value }: { label: string; value: string }) {
	return <div className="rounded-lg border bg-muted/20 px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>
}

function SettingsError({ text, onRetry }: { text: string; onRetry: () => void }) {
	return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/70 bg-amber-500/5 px-4 py-3 text-sm dark:border-amber-700/70"><span className="text-muted-foreground">{text}</span><Button variant="outline" size="sm" onClick={onRetry}>重试</Button></div>
}
