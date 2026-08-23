import { Card, CardContent, CardHeader, CardTitle } from '@douyin-keeper/ui-web'

export function AdminPlaceholder({ note }: { note: string }) {
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