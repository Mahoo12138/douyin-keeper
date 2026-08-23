<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        class="h-auto p-0 font-medium hover:bg-transparent hover:text-accent-foreground flex items-center"
      >
        {{ title }}
        <div class="ml-2 flex flex-col">
          <ArrowUp v-if="sortDirection === 'asc'" class="h-3 w-3" />
          <ArrowDown v-else-if="sortDirection === 'desc'" class="h-3 w-3" />
          <ArrowUpDown v-else class="h-3 w-3" />
        </div>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      <DropdownMenuItem @click="column.toggleSorting(false)">
        <ArrowUp class="mr-2 h-4 w-4" />
        {{ ascendingText }}
      </DropdownMenuItem>
      <DropdownMenuItem @click="column.toggleSorting(true)">
        <ArrowDown class="mr-2 h-4 w-4" />
        {{ descendingText }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="column.clearSorting()">
        {{ noneText }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-vue-next'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface Props {
  column: any
  title: string
  ascendingText?: string
  descendingText?: string
  noneText?: string
}

const props = withDefaults(defineProps<Props>(), {
  ascendingText: 'Ascending',
  descendingText: 'Descending',
  noneText: 'Clear sort'
})

const sortDirection = computed(() => props.column.getIsSorted())
</script>

