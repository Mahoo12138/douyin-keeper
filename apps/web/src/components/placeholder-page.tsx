import { Card, CardContent, CardHeader, CardTitle } from '@douyin-keeper/ui-web'

/** Skeleton page for modules arriving in later milestones. */
export function PlaceholderPage({ note }: { note: string }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>模块占位</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{note}</CardContent>
      </Card>
    </div>
  )
}