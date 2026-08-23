'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createValidators } from '@libs/validators';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@libs/react-shared/ui/button';
import { Input } from '@libs/react-shared/ui/input';
import { Label } from '@libs/react-shared/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@libs/react-shared/ui/card';
import type { z } from 'zod';

export default function ValidatorTestPage() {
  const { t, tWithParams } = useTranslation();
  
  // 创建国际化验证器
  const { loginFormSchema, phoneLoginSchema, forgetPasswordSchema } = createValidators(tWithParams);
  
  type LoginFormData = z.infer<typeof loginFormSchema>;
  type PhoneFormData = z.infer<typeof phoneLoginSchema>;
  type ForgetPasswordFormData = z.infer<typeof forgetPasswordSchema>;
  
  const [testResults, setTestResults] = useState<string[]>([]);

  // 登录表单
  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: loginErrors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    mode: 'onBlur'
  });

  // 手机登录表单
  const {
    register: registerPhone,
    handleSubmit: handleSubmitPhone,
    formState: { errors: phoneErrors }
  } = useForm<PhoneFormData>({
    resolver: zodResolver(phoneLoginSchema),
    mode: 'onBlur'
  });

  // 忘记密码表单
  const {
    register: registerForget,
    handleSubmit: handleSubmitForget,
    formState: { errors: forgetErrors }
  } = useForm<ForgetPasswordFormData>({
    resolver: zodResolver(forgetPasswordSchema),
    mode: 'onBlur'
  });

  const onLoginSubmit = (data: LoginFormData) => {
    setTestResults(prev => [...prev, `登录验证通过: ${JSON.stringify(data)}`]);
  };

  const onPhoneSubmit = (data: PhoneFormData) => {
    setTestResults(prev => [...prev, `手机验证通过: ${JSON.stringify(data)}`]);
  };

  const onForgetSubmit = (data: ForgetPasswordFormData) => {
    setTestResults(prev => [...prev, `忘记密码验证通过: ${JSON.stringify(data)}`]);
  };

  return (
    <div className="container mx-auto p-8 space-y-6">
      <h1 className="text-3xl font-bold">Next.js 验证器测试</h1>
      
      {/* 翻译函数直接测试 */}
      <Card>
        <CardHeader>
          <CardTitle>翻译函数测试</CardTitle>
          <CardDescription>测试 tWithParams 参数插值功能</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><strong>无参数:</strong> {tWithParams('validators.user.email.invalid')}</p>
          <p><strong>带参数:</strong> {tWithParams('validators.user.password.minLength', { min: 8 })}</p>
          <p><strong>不存在的键:</strong> {tWithParams('validators.user.nonexistent')}</p>
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>验证模式:</strong> 所有表单都使用 <code>mode: 'onBlur'</code>，
              在字段失去焦点时进行验证，提供一致的用户体验。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 登录表单验证 */}
      <Card>
        <CardHeader>
          <CardTitle>登录表单验证</CardTitle>
          <CardDescription>输入无效数据测试验证器</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitLogin(onLoginSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                {...registerLogin('email')}
                placeholder="输入无效邮箱测试"
              />
              {loginErrors.email && (
                <p className="text-red-500 text-sm mt-1">{loginErrors.email.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                {...registerLogin('password')}
                placeholder="输入短密码测试"
              />
              {loginErrors.password && (
                <p className="text-red-500 text-sm mt-1">{loginErrors.password.message}</p>
              )}
            </div>
            <Button type="submit">测试登录验证</Button>
          </form>
        </CardContent>
      </Card>

      {/* 手机登录表单验证 */}
      <Card>
        <CardHeader>
          <CardTitle>手机登录验证</CardTitle>
          <CardDescription>测试手机号和国家代码验证</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitPhone(onPhoneSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="phone-country">Country Code</Label>
              <Input
                id="phone-country"
                {...registerPhone('countryCode')}
                placeholder="留空测试必填验证"
              />
              {phoneErrors.countryCode && (
                <p className="text-red-500 text-sm mt-1">{phoneErrors.countryCode.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="phone-number">Phone Number</Label>
              <Input
                id="phone-number"
                {...registerPhone('phone')}
                placeholder="输入无效手机号测试"
              />
              {phoneErrors.phone && (
                <p className="text-red-500 text-sm mt-1">{phoneErrors.phone.message}</p>
              )}
            </div>
            <Button type="submit">测试手机验证</Button>
          </form>
        </CardContent>
      </Card>

      {/* 忘记密码表单验证 */}
      <Card>
        <CardHeader>
          <CardTitle>忘记密码验证</CardTitle>
          <CardDescription>测试邮箱验证</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitForget(onForgetSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="forget-email">Email</Label>
              <Input
                id="forget-email"
                type="email"
                {...registerForget('email')}
                placeholder="输入无效邮箱测试"
              />
              {forgetErrors.email && (
                <p className="text-red-500 text-sm mt-1">{forgetErrors.email.message}</p>
              )}
            </div>
            <Button type="submit">测试忘记密码验证</Button>
          </form>
        </CardContent>
      </Card>

      {/* 测试结果 */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>测试结果</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {testResults.map((result, index) => (
                <li key={index} className="text-green-600">{result}</li>
              ))}
            </ul>
            <Button 
              variant="outline" 
              onClick={() => setTestResults([])}
              className="mt-4"
            >
              清空结果
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 