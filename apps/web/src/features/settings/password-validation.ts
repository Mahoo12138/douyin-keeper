import { z } from 'zod'

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1, '请输入当前密码').max(256),
	newPassword: z.string().min(8, '新密码至少 8 个字符').max(256, '新密码最多 256 个字符'),
	confirmPassword: z.string().min(1, '请再次输入新密码').max(256),
}).superRefine((value, context) => {
	if (value.newPassword === value.currentPassword) {
		context.addIssue({ code: z.ZodIssueCode.custom, path: ['newPassword'], message: '新密码不能与当前密码相同' })
	}
	if (value.confirmPassword !== value.newPassword) {
		context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: '两次输入的新密码不一致' })
	}
})

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>
