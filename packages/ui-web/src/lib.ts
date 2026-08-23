import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui cn helper (reference: tinyship libs/ui/utils/cn). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}