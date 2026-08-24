import { useState } from 'react'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@douyin-keeper/ui-web'
import { login } from '@douyin-keeper/sdk-ts'

import { setToken } from '@/auth/session'
import { canActivate } from '@/lib/auth-guard'

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

type Form = z.infer<typeof schema>

export const Route = createFileRoute('/(auth)/signin')({
  beforeLoad: async () => {
    if (await canActivate()) throw redirect({ to: '/dashboard' })
  },
  component: SignInPage,
})

function SignInPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } })

  async function onSubmit(values: Form) {
    setBusy(true)
    try {
      const res = await login(values.username, values.password)
      setToken(res.access_token)
      toast.success('登录成功')
      navigate({ to: '/dashboard' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">登录</CardTitle>
        <CardDescription>Douyin Keeper Next · 抖音火花助手</CardDescription>
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
            <Input id="password" type="password" {...form.register('password')} autoComplete="current-password" />
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          还没有账号？<Link to="/signup" className="text-primary hover:underline">注册</Link>
        </p>
      </CardContent>
    </Card>
  )
}
