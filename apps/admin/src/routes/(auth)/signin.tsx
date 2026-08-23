import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@douyin-keeper/ui-web'
import { login } from '@douyin-keeper/sdk-ts'

import { setToken } from '@/auth/session'

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

type Form = z.infer<typeof schema>

export const Route = createFileRoute('/(auth)/signin')({
  component: AdminSignIn,
})

function AdminSignIn() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } })

  async function onSubmit(values: Form) {
    setBusy(true)
    try {
      const res = await login(values.username, values.password)
      if (res.user.role !== 'admin') {
        toast.error('该账号没有管理权限')
        return
      }
      setToken(res.access_token)
      toast.success('管理员已登录')
      navigate({ to: '/overview' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">管理控制台</CardTitle>
          <CardDescription>Douyin Keeper Admin</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input id="username" {...form.register('username')} autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" {...form.register('password')} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? '登录中…' : '登录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}