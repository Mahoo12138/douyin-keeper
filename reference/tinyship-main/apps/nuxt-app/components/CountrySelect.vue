<template>
  <Select 
    :model-value="modelValue" 
    @update:model-value="handleValueChange"
    :disabled="disabled"
  >
    <SelectTrigger :class="cn('w-[140px]', className)">
      <SelectValue :placeholder="placeholder">
        <div v-if="selectedCountry" class="flex items-center gap-2">
          <span class="text-lg">{{ selectedCountry.flag }}</span>
          <span class="text-sm">{{ selectedCountry.code }}</span>
        </div>
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem 
        v-for="country in countriesWithNames" 
        :key="country.code" 
        :value="country.code"
      >
        <div class="flex items-center gap-3">
          <span class="text-lg">{{ country.flag }}</span>
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ country.name }}</span>
            <span class="text-sm text-muted-foreground">{{ country.code }}</span>
          </div>
        </div>
      </SelectItem>
    </SelectContent>
  </Select>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCountriesWithNames } from '@libs/validators'

interface CountrySelectProps {
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

// Define props
const props = withDefaults(defineProps<CountrySelectProps>(), {
  placeholder: '选择国家/地区',
  disabled: false,
})

// Define emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Get current locale
const { locale } = useI18n()

// Get countries with localized names
const countriesWithNames = computed(() => 
  getCountriesWithNames(locale.value as 'en' | 'zh-CN')
)

// Handle value changes
const handleValueChange = (value: any) => {
  if (value && typeof value === 'string') {
    emit('update:modelValue', value)
  }
}

// Find selected country based on current value
const selectedCountry = computed(() => 
  countriesWithNames.value.find((country) => country.code === props.modelValue)
)
</script> 