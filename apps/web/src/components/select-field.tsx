import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@douyin-keeper/ui-web'

const EMPTY_VALUE = '__empty__'

export type SelectFieldOption = { value: string; label: string; disabled?: boolean }

export function SelectField({ id, label, value, options, onChange, disabled, placeholder = '请选择', ariaLabel, className }: {
  id: string
  label?: string
  value: string
  options: SelectFieldOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const selectValue = value || (options.some((option) => option.value === '') ? EMPTY_VALUE : undefined)
  return (
    <div className={className ?? 'space-y-1.5'}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Select value={selectValue} onValueChange={(next) => onChange(next === EMPTY_VALUE ? '' : next)} disabled={disabled}>
        <SelectTrigger id={id} aria-label={ariaLabel ?? label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value || EMPTY_VALUE} value={option.value || EMPTY_VALUE} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
