export function passwordChangeError(currentPassword: string, newPassword: string, confirmPassword: string) {
  if (!currentPassword) return '请输入当前密码。'
  if (newPassword.length < 8 || newPassword.length > 256) return '新密码长度需为 8–256 个字符。'
  if (newPassword === currentPassword) return '新密码不能与当前密码相同。'
  if (newPassword !== confirmPassword) return '两次输入的新密码不一致。'
  return ''
}
