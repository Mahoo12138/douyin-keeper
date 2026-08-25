import * as React from 'react'
import { CalendarDays } from 'lucide-react'

import { Button } from './button'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { cn } from '../lib'

function formatDate(value: Date | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(value)
}

export type DatePickerProps = {
  value?: Date
  onChange?: (value: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  fromDate?: Date
  toDate?: Date
  id?: string
  'aria-label'?: string
  className?: string
}

export function DatePicker({ value, onChange, placeholder = '选择日期', disabled, fromDate, toDate, id, className, ...props }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} aria-label={props['aria-label']} className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground', className)}>
          <CalendarDays className="size-4" />
          {value ? formatDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} startMonth={fromDate} endMonth={toDate} autoFocus />
      </PopoverContent>
    </Popover>
  )
}

export function formatDateTimeInput(value: Date | undefined) {
  if (!value) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function formatDateTime(value: Date | undefined) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}

function withTime(value: Date, hours: number, minutes: number) {
  const next = new Date(value)
  next.setHours(hours, minutes, 0, 0)
  return next
}

const hours = Array.from({ length: 24 }, (_, value) => ({ value: String(value).padStart(2, '0'), label: `${String(value).padStart(2, '0')} 时` }))
const minutes = [0, 15, 30, 45].map((value) => ({ value: String(value).padStart(2, '0'), label: `${String(value).padStart(2, '0')} 分` }))

export function DateTimePicker({ value, onChange, placeholder = '选择日期时间', disabled, id, className }: DatePickerProps) {
  const selected = value ?? new Date()
  const updateTime = (part: 'hours' | 'minutes', nextValue: string) => {
    const next = withTime(selected, part === 'hours' ? Number(nextValue) : selected.getHours(), part === 'minutes' ? Number(nextValue) : selected.getMinutes())
    onChange?.(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground', className)}>
          <CalendarDays className="size-4" />
          {value ? formatDateTime(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={(next) => onChange?.(next ? withTime(next, selected.getHours(), selected.getMinutes()) : undefined)} autoFocus />
        <div className="flex items-center gap-2 border-t p-3">
          <TimeSelect aria-label="小时" value={String(selected.getHours()).padStart(2, '0')} options={hours} onChange={(next) => updateTime('hours', next)} />
          <span className="text-sm text-muted-foreground">:</span>
          <TimeSelect aria-label="分钟" value={String(selected.getMinutes()).padStart(2, '0')} options={minutes} onChange={(next) => updateTime('minutes', next)} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TimeSelect({ value, options, onChange, ...props }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; 'aria-label': string }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-24" {...props}><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
}
