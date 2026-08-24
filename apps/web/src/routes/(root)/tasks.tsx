import { createFileRoute } from '@tanstack/react-router'
import { TasksPage } from '@/features/tasks/tasks-page'

export const Route = createFileRoute('/(root)/tasks')({
  component: TasksPage,
})
