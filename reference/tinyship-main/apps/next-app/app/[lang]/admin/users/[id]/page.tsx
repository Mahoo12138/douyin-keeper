'use client';

import { use } from 'react'
import { useEffect, useState } from 'react'
import { notFound, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@libs/react-shared/ui/card'
import { Button } from '@libs/react-shared/ui/button'
import { Input } from '@libs/react-shared/ui/input'
import { Switch } from '@libs/react-shared/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libs/react-shared/ui/select'
import { Label } from '@libs/react-shared/ui/label'
import { userRoles } from '@libs/database/constants'
import Link from 'next/link'
import { SaveIcon, Trash2Icon } from 'lucide-react'
import { authClientReact } from "@libs/auth/authClient"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createValidators } from "@libs/validators"
import { z } from "zod"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@libs/react-shared/ui/alert-dialog'
import { toast } from "sonner"
import { Skeleton } from "@libs/react-shared/ui/skeleton"
import { useTranslation } from "@/hooks/use-translation"



interface UserPageProps {
  params: Promise<{
    id?: string
  }>
}

export default function UserPage({ params }: UserPageProps) {
  const { t, tWithParams } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedParams = use(params);
  const { id } = resolvedParams;
  const isEditMode = id !== 'new';

  // 创建国际化验证器
  const { userSchema, emailSignUpSchema, updateUserSchema } = createValidators(tWithParams);

  // 创建用户schema（包含密码字段）
  const createUserSchema = emailSignUpSchema.extend({
    image: z.string().url().optional().or(z.literal('')),
    role: z.enum([userRoles.ADMIN, userRoles.USER]).default(userRoles.USER),
    phoneNumber: z.string().nullable().optional(),
    emailVerified: z.boolean().default(false),
    phoneNumberVerified: z.boolean().default(false),
    banned: z.boolean().default(false),
    banReason: z.string().nullable().optional(),
  });

  type CreateUserFormData = z.infer<typeof createUserSchema>;
  type UpdateUserFormData = z.infer<typeof updateUserSchema>;

  const [affiliateInfo, setAffiliateInfo] = useState<{
    referralCode?: string | null
    referredByCode?: string | null
    commissionBalance?: string | null
  }>({})

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors }
  } = useForm<CreateUserFormData | UpdateUserFormData>({
    resolver: zodResolver(isEditMode ? updateUserSchema : createUserSchema),
    defaultValues: {
      role: userRoles.USER,
      emailVerified: false,
      phoneNumberVerified: false,
      banned: false,
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    const fetchUser = async () => {
      if (id === 'new') {
        setLoading(false);
        return;
      }

      if (!id) {
        notFound();
      }

      try {
        const response = await fetch(`/api/users/${id}`);
        if (!response.ok) {
          throw new Error(t.admin.users.messages.fetchError);
        }
        const userData = await response.json();
        reset(userData);
        setAffiliateInfo({
          referralCode: userData.referralCode,
          referredByCode: userData.referredByCode,
          commissionBalance: userData.commissionBalance,
        });
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.admin.users.messages.fetchError);
        notFound();
      }
    };

    fetchUser();
  }, [id, reset, t]);

  const onSubmit = async (data: CreateUserFormData | UpdateUserFormData) => {
    setError(null);

    try {
      if (isEditMode && id) {
        // Update user through API (handles all fields including role and ban status)
        await fetch(`/api/users/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        toast.success(t.admin.users.messages.updateSuccess);
      } else {
        // Create user
        const createData = data as CreateUserFormData;
        const { data: result, error } = await authClientReact.admin.createUser({
          name: createData.name,
          email: createData.email,
          password: createData.password,
          role: createData.role,
          data: {
            image: createData.image || undefined,
            phoneNumber: createData.phoneNumber || undefined,
            emailVerified: createData.emailVerified,
            phoneNumberVerified: createData.phoneNumberVerified,
            banned: createData.banned,
            banReason: createData.banReason || undefined,
          },
        });

        if (error) {
          const errorMessage = error.message || t.admin.users.messages.operationFailed;
          setError(errorMessage);
          toast.error(errorMessage);
          return;
        }

        toast.success(t.admin.users.messages.createSuccess);
      }

      router.push('/admin/users');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t.admin.users.messages.operationFailed;
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleDelete = async () => {
    const { data, error } = await authClientReact.admin.removeUser({
      userId: id as string,
    });
    
    if (error) {
      const errorMessage = error.message || t.admin.users.messages.deleteError;
      setError(errorMessage);
      toast.error(errorMessage);
      return;
    }
    
    toast.success(t.admin.users.messages.deleteSuccess);
    router.push('/admin/users');
  };

  if (loading) {
    return (
      <div className="container mx-auto p-10">
        <div className="mb-6">
          <Skeleton className="h-6 w-32" />
        </div>

        <Skeleton className="h-10 w-60 mb-6" />

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <Skeleton className="h-7 w-40 mb-2" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
          <CardFooter className="pt-6">
            <Skeleton className="h-10 w-32" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-10">
      <div className="flex items-center mb-6">
        <Link href="/admin/users" className="text-blue-500 hover:text-blue-700">
          ← {t.actions.backToList}
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-6">
        {isEditMode ? t.admin.users.editUser : t.admin.users.createUser}
      </h1>

      {error && (
        <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-md">
          {error}
        </div>
      )}

      <form 
        onSubmit={handleSubmit(onSubmit)}
        className="max-w-2xl mx-auto"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.users.form.title}</CardTitle>
            <CardDescription>{t.admin.users.form.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t.admin.users.form.labels.name}</Label>
              <Input 
                id="name"
                {...register('name')}
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && (
                <p className="text-red-500 text-sm">{errors.name.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">{t.admin.users.form.labels.email}</Label>
              <Input 
                id="email"
                type="email"
                {...register('email')}
                disabled={isEditMode}
                className={errors.email ? "border-red-500" : ""}
              />
              {errors.email && (
                <p className="text-red-500 text-sm">{errors.email.message}</p>
              )}
            </div>
            
            {!isEditMode && (
              <div className="space-y-2">
                <Label htmlFor="password">{t.admin.users.form.labels.password}</Label>
                <Input 
                  id="password"
                  type="password"
                  {...register('password')}
                  className={errors['password' as keyof typeof errors] ? "border-red-500" : ""}
                />
                {errors['password' as keyof typeof errors] && (
                  <p className="text-red-500 text-sm">
                    {errors['password' as keyof typeof errors]?.message}
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="role">{t.admin.users.form.labels.role}</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <SelectTrigger className={errors.role ? "border-red-500" : ""}>
                      <SelectValue placeholder={t.admin.users.form.placeholders.selectRole} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={userRoles.ADMIN}>{userRoles.ADMIN}</SelectItem>
                      <SelectItem value={userRoles.USER}>{userRoles.USER}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.role && (
                <p className="text-red-500 text-sm">{errors.role.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image">{t.admin.users.form.labels.image}</Label>
              <Input 
                id="image"
                {...register('image')}
                className={errors.image ? "border-red-500" : ""}
              />
              {errors.image && (
                <p className="text-red-500 text-sm">{errors.image.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">{t.admin.users.form.labels.phoneNumber}</Label>
              <Input 
                id="phoneNumber"
                {...register('phoneNumber')}
                className={errors.phoneNumber ? "border-red-500" : ""}
              />
              {errors.phoneNumber && (
                <p className="text-red-500 text-sm">{errors.phoneNumber.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="emailVerified" className="font-semibold">
                {t.admin.users.form.labels.emailVerified}
              </Label>
              <Controller
                name="emailVerified"
                control={control}
                render={({ field }) => (
                  <Switch 
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="phoneNumberVerified" className="font-semibold">
                {t.admin.users.form.labels.phoneVerified}
              </Label>
              <Controller
                name="phoneNumberVerified"
                control={control}
                render={({ field }) => (
                  <Switch 
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="banned" className="font-semibold">
                {t.admin.users.form.labels.banned}
              </Label>
              <Controller
                name="banned"
                control={control}
                render={({ field }) => (
                  <Switch 
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="banReason">{t.admin.users.form.labels.banReason}</Label>
              <Input 
                id="banReason"
                {...register('banReason')}
                className={errors.banReason ? "border-red-500" : ""}
              />
              {errors.banReason && (
                <p className="text-red-500 text-sm">{errors.banReason.message}</p>
              )}
            </div>

            {isEditMode && (
              <div className="border-t pt-4 mt-4 space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {t.admin.users.table.columns.referralCode}
                </h3>
                <div className="space-y-2">
                  <Label>{t.admin.users.form.labels.referralCode}</Label>
                  <Input readOnly value={affiliateInfo.referralCode || '—'} className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>{t.admin.users.form.labels.referredByCode}</Label>
                  <Input readOnly value={affiliateInfo.referredByCode || '—'} className="bg-muted" />
                </div>
                <div className="space-y-2">
                  <Label>{t.admin.users.form.labels.commissionBalance}</Label>
                  <Input readOnly value={affiliateInfo.commissionBalance || '0'} className="bg-muted" />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between space-x-4 pt-6">
            <div className="flex space-x-4">
              <Button 
                type="submit" 
                className="flex items-center gap-2"
              >
                <SaveIcon className="h-4 w-4" />
                {isEditMode ? t.actions.saveChanges : t.actions.createUser}
              </Button>
              
              {isEditMode && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" type="button" className="flex items-center gap-2">
                      <Trash2Icon className="h-4 w-4" />
                      {t.actions.deleteUser}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t.admin.users.deleteDialog.title}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t.admin.users.deleteDialog.description}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t.actions.cancel}</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {t.actions.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
} 