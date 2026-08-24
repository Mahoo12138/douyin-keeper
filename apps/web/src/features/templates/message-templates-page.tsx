import { useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createMessageTemplate, deleteMessageTemplate, listMessageTemplates, updateMessageTemplate, type MessageTemplateInput, type MessageTemplatePatch } from '@douyin-keeper/sdk-ts'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Skeleton } from '@douyin-keeper/ui-web'
import { FileText, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'

import { getToken } from '@/auth/session'

type Template = NonNullable<Awaited<ReturnType<typeof listMessageTemplates>>>['items'][number]
type Editor = MessageTemplateInput & { id?: string }

const emptyEditor: Editor = { name: '', kind: 'text', body: '' }

export function MessageTemplatesPage() {
  const token = getToken()
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<Editor | null>(null)
  const templatesQ = useInfiniteQuery({
    queryKey: ['message-templates'],
    queryFn: ({ pageParam }) => listMessageTemplates(token as string, { limit: 50, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!token,
  })
  const saveMutation = useMutation({
    mutationFn: (input: Editor) => input.id ? updateMessageTemplate(token as string, input.id, editorPatch(input)) : createMessageTemplate(token as string, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      setEditor(null)
      toast.success('模板已保存')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '保存模板失败'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMessageTemplate(token as string, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      toast.success('模板已删除')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '删除模板失败'),
  })

  const templates = templatesQ.data?.pages.flatMap((page) => page.items) ?? []
  function save() {
    if (!editor) return
    const normalized = { ...editor, name: editor.name.trim(), body: editor.body.trim() }
    if (!normalized.name) return toast.error('请填写模板名称')
    if (!normalized.body) return toast.error(normalized.kind === 'sticker' ? '请填写贴纸 ID' : '请填写模板内容')
    saveMutation.mutate(normalized)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">V1.1 · 消息配置</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">消息模板池</h1><p className="mt-1 text-sm text-muted-foreground">管理可复用的文字和贴纸内容，在任务编辑时快速套用。</p></div>
        {!editor && <Button onClick={() => setEditor({ ...emptyEditor })}><Plus />新建模板</Button>}
      </div>

      {editor && <TemplateEditor editor={editor} saving={saveMutation.isPending} onChange={(patch) => setEditor((current) => current ? { ...current, ...patch } : current)} onSave={save} onClose={() => setEditor(null)} />}

      <Card>
        <CardHeader><div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="size-5" /></div><div><CardTitle>我的模板</CardTitle><CardDescription>{templates.length ? `共 ${templates.length} 个模板，套用到任务后会保存为任务自己的内容快照。` : '模板只属于当前账号用户，不会暴露给其他用户。'}</CardDescription></div></div></CardHeader>
        <CardContent>{templatesQ.isLoading ? <TemplateLoading /> : templatesQ.isError ? <ErrorState onRetry={() => void templatesQ.refetch()} /> : templates.length ? <><TemplateList templates={templates} deletingId={deleteMutation.isPending ? deleteMutation.variables : null} onEdit={(item) => setEditor({ id: item.id, name: item.name, kind: item.kind, body: item.body })} onDelete={(item) => { if (window.confirm(`确定删除“${item.name}”吗？`)) deleteMutation.mutate(item.id) }} />{templatesQ.hasNextPage && <div className="mt-6 flex justify-center"><Button variant="outline" onClick={() => void templatesQ.fetchNextPage()} disabled={templatesQ.isFetchingNextPage}>{templatesQ.isFetchingNextPage ? '加载中…' : '加载更多模板'}</Button></div>}</> : <EmptyState onCreate={() => setEditor({ ...emptyEditor })} />}</CardContent>
      </Card>
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/20"><Sparkles className="mt-0.5 size-4 shrink-0 text-amber-600" /><p className="text-muted-foreground">模板不会自动修改已有任务。任务页选择模板时会复制当前内容，避免后续编辑模板时意外改变正在执行的任务。</p></div>
    </div>
  )
}

function TemplateEditor({ editor, saving, onChange, onSave, onClose }: { editor: Editor; saving: boolean; onChange: (patch: Partial<Editor>) => void; onSave: () => void; onClose: () => void }) {
  return <Card className="border-primary/30"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{editor.id ? '编辑模板' : '新建模板'}</CardTitle><CardDescription>名称用于在任务编辑器中识别，内容会在保存时去除首尾空格。</CardDescription></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭模板编辑"><X /></Button></div></CardHeader><CardContent className="grid gap-4 md:grid-cols-[minmax(180px,0.8fr)_minmax(150px,0.5fr)_minmax(280px,1.7fr)_auto] md:items-end"><div className="space-y-1.5"><Label htmlFor="template-name">模板名称</Label><Input id="template-name" value={editor.name} maxLength={80} onChange={(event) => onChange({ name: event.target.value })} placeholder="例如：晚安问候" /></div><div className="space-y-1.5"><Label htmlFor="template-kind">类型</Label><select id="template-kind" value={editor.kind} onChange={(event) => onChange({ kind: event.target.value as Editor['kind'] })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="text">文字</option><option value="sticker">贴纸</option></select></div><div className="space-y-1.5"><Label htmlFor="template-body">{editor.kind === 'sticker' ? '贴纸 ID' : '模板内容'}</Label>{editor.kind === 'sticker' ? <Input id="template-body" value={editor.body} maxLength={500} onChange={(event) => onChange({ body: event.target.value })} placeholder="输入稳定 sticker_id" /> : <textarea id="template-body" value={editor.body} maxLength={500} rows={2} onChange={(event) => onChange({ body: event.target.value })} placeholder="输入可复用的文字内容" className="flex min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" />}</div><div className="flex gap-2"><Button variant="outline" onClick={onClose} disabled={saving}>取消</Button><Button onClick={onSave} disabled={saving}><Save />{saving ? '保存中…' : '保存'}</Button></div></CardContent></Card>
}

function TemplateList({ templates, deletingId, onEdit, onDelete }: { templates: Template[]; deletingId: string | null; onEdit: (item: Template) => void; onDelete: (item: Template) => void }) {
  return <div className="grid gap-3 md:grid-cols-2">{templates.map((item) => <div key={item.id} className="rounded-xl border p-4 transition-colors hover:bg-accent/30"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate font-medium">{item.name}</h2><Badge variant="secondary">{item.kind === 'sticker' ? '贴纸' : '文字'}</Badge></div><p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.body}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" onClick={() => onEdit(item)} disabled={!!deletingId} aria-label={`编辑${item.name}`}><Pencil /></Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onDelete(item)} disabled={!!deletingId} aria-label={`删除${item.name}`}><Trash2 /></Button></div></div><p className="mt-4 text-xs text-muted-foreground">更新于 {formatDate(item.updated_at)}</p></div>)}</div>
}

function EmptyState({ onCreate }: { onCreate: () => void }) { return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center"><FileText className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">还没有消息模板</p><p className="mt-1 text-sm text-muted-foreground">创建常用问候语，之后可以在任务编辑器中快速套用。</p><Button className="mt-4" variant="outline" onClick={onCreate}><Plus />创建第一个模板</Button></div> }

function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="py-10 text-center"><p className="font-medium">模板列表暂时不可用</p><p className="mt-1 text-sm text-muted-foreground">请稍后重试。</p><Button className="mt-4" variant="outline" onClick={onRetry}>重新加载</Button></div> }

function TemplateLoading() { return <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div> }

function editorPatch(editor: Editor): MessageTemplatePatch { return { name: editor.name, kind: editor.kind, body: editor.body } }

function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
