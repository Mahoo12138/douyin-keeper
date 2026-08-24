import { createFileRoute } from '@tanstack/react-router'

import { AdminSettingsPage } from '@/features/admin/admin-settings-page'

export const Route = createFileRoute('/admin/settings')({ component: AdminSettingsPage })
