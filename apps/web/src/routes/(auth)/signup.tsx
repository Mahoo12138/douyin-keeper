import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@douyin-keeper/ui-web'
import { register } from '@douyin-keeper/sdk-ts'

import { setToken } from '@/auth/session'

const schema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符').max(64),
  password: z.string().min(8, '密码至少 8 个字符').max(256),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: '两次密码不一致', path: ['confirm'] })

type Form = z.infer<typeof schema>

export const Route = createFileRoute('/(auth)/signup')({
  component: SignUpPage,
})

function SignUpPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '', confirm: '' } })

  async function onSubmit(values: Form) {
    setBusy(true)
    try {
      const res = await register(values.username, values.password)
      setToken(res.access_token)
      toast.success('注册成功')
      navigate({ to: '/dashboard' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注册失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">注册</CardTitle>
        <CardDescription>创建 Douyin Keeper 账号</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">用户名</Label>
            <Input id="username" {...form.register('username')} autoComplete="username" />
            {form.formState.errors.username && (
              <p className="text-sm text-destructive">{form.formState.errors.username.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <Input id="password" type="password" {...form.register('password')} autoComplete="new-password" />
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">确认密码</Label>
            <Input id="confirm" type="password" {...form.register('confirm')} autoComplete="new-password" />
            {form.formState.errors.confirm && (
              <p className="text-sm text-destructive">{form.formState.errors.confirm.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? '注册中…' : '注册'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          已有账号？<Link to="/signin" className="text-primary hover:underline">登录</Link>
        </p>
      </CardContent>
    </Card>
  )
}