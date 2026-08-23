'use client';

import * as React from "react"
import { cn } from '@libs/ui/utils/cn'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"
import { getCountriesWithNames } from "@libs/validators"
import { useSharedApp } from "../providers/app-context"

interface CountrySelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function CountrySelect({
  value,
  onValueChange,
  placeholder = "选择国家/地区",
  disabled = false,
  className,
}: CountrySelectProps) {
  const { locale } = useSharedApp()
  
  // Get countries with localized names
  const countriesWithNames = getCountriesWithNames(locale as 'en' | 'zh-CN')
  
  // Find selected country
  const selectedCountry = countriesWithNames.find((country) => country.code === value)

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={cn("h-9 w-[140px]", className)}>
        <SelectValue placeholder={placeholder}>
          {selectedCountry && (
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">{selectedCountry.flag}</span>
              <span className="text-sm">{selectedCountry.code}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {countriesWithNames.map((country) => (
          <SelectItem key={country.code} value={country.code}>
            <div className="flex w-full min-w-0 items-center gap-3 pr-1">
              <span className="text-lg">{country.flag}</span>
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{country.name}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{country.code}</span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 