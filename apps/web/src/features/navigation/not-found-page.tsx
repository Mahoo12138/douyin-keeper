import { Link, useLocation } from '@tanstack/react-router'
import { SearchX } from 'lucide-react'
import { Button, Card, CardContent, CardHeader } from '@douyin-keeper/ui-web'

import { notFoundCopy } from './not-found-content'

export function NotFoundPage() {
  const location = useLocation()

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-6" aria-hidden="true" />
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-none tracking-tight">{notFoundCopy.title}</h1>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm leading-6 text-muted-foreground">{notFoundCopy.description}</p>
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{location.pathname}</p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">{notFoundCopy.homeLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
