import * as React from 'react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '../lib'

const calendarClassNames: NonNullable<DayPickerProps['classNames']> = {
  root: 'p-3',
  months: 'flex flex-col gap-4 sm:flex-row',
  month: 'relative space-y-4',
  month_caption: 'flex h-9 items-center justify-center',
  caption_label: 'text-sm font-medium',
  nav: 'absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between',
  button_previous: 'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  button_next: 'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  month_grid: 'w-full border-collapse space-y-1',
  weekdays: 'flex',
  weekday: 'w-9 rounded-md text-center text-[0.8rem] font-normal text-muted-foreground',
  week: 'mt-2 flex w-full',
  day: 'relative size-9 p-0 text-center text-sm',
  day_button: 'inline-flex size-9 items-center justify-center rounded-md p-0 font-normal hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring',
  selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
  today: 'bg-accent text-accent-foreground',
  outside: 'text-muted-foreground opacity-50',
  disabled: 'text-muted-foreground opacity-50',
  range_start: 'rounded-l-md rounded-r-none',
  range_middle: 'rounded-none',
  range_end: 'rounded-l-none rounded-r-md',
  hidden: 'invisible',
}

export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      locale={zhCN}
      showOutsideDays
      className={cn('w-fit', className)}
      classNames={{ ...calendarClassNames, ...classNames }}
      components={{
        Chevron: ({ orientation, ...iconProps }) => orientation === 'left' ? <ChevronLeft className="size-4" {...iconProps} /> : <ChevronRight className="size-4" {...iconProps} />,
      }}
      {...props}
    />
  )
}
