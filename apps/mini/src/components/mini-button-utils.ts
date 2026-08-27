export function miniButtonDisabledProps(disabled?: boolean) {
  return disabled ? { disabled: true as const } : {}
}
