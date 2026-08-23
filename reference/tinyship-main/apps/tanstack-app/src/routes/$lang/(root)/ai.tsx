import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useState, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { MessageSquareIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import { config } from '@config'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@libs/react-shared/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
} from '@libs/react-shared/components/ai-elements/message'
import { Response } from '@libs/react-shared/components/ai-elements/response'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputModelSelect,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectValue,
} from '@libs/react-shared/components/ai-elements/prompt-input'
import '@/highlight.css'

export const Route = createFileRoute('/$lang/(root)/ai')({
  head: ({ params }) => seoHead(params.lang, (t) => t.ai.metadata),
  component: ChatPage,
})

function ChatPage() {
  const { t, locale } = useTranslation()
  const initialMessages: any[] = [
    { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello, I am Grok, an AI assistant.' }] },
    { id: '2', role: 'assistant', parts: [{ type: 'text', text: `# Hello, Markdown!\nThis is a **bold** text with some *italic* content.\n\n- Item 1\n- Item 2\n\n\`\`\`javascript\nconsole.log("Code block");\n\`\`\`\n` }] },
  ]
  const { messages, sendMessage, setMessages, status, error, regenerate } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (error) => console.error('Chat error:', error),
  })

  const providerModels = config.ai.availableModels
  const [provider, setProvider] = useState<keyof typeof providerModels>(config.ai.defaultProvider)
  const [model, setModel] = useState<string>(config.ai.defaultModels[config.ai.defaultProvider])
  const [hasAccess, setHasAccess] = useState(true)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [inputAreaHeight, setInputAreaHeight] = useState(160)

  const checkAccessStatus = async () => {
    try {
      const response = await fetch('/api/credits/status', { method: 'GET' })
      const data = await response.json()
      const balance = data?.credits?.balance || 0
      setHasAccess(balance > 0)
      setCreditBalance(balance)
    } catch {
      setHasAccess(false)
      setCreditBalance(0)
    }
  }

  const startNewConversation = () => setMessages([])

  const handlePromptSubmit = async (message: { text?: string; files?: any[] }) => {
    if (!message.text?.trim()) return
    if (!hasAccess) {
      toast.error(t.ai.chat.errors.insufficientCredits || 'Insufficient Credits', {
        description: t.ai.chat.errors.insufficientCreditsDescription || 'You need credits or a subscription to use AI chat.',
        action: { label: t.dashboard.credits?.buyMore || t.common.viewPlans, onClick: () => { window.location.href = `/${locale}/pricing` } },
      })
      return
    }
    await sendMessage({ text: message.text }, { body: { provider, model } })
    checkAccessStatus()
  }

  const calculateInputHeight = () => {
    const el = document.querySelector('.fixed.bottom-0')
    if (el) {
      const rect = el.getBoundingClientRect()
      setInputAreaHeight(rect.height + 40)
    }
  }

  useEffect(() => {
    checkAccessStatus()
    setTimeout(calculateInputHeight, 100)
    window.addEventListener('resize', calculateInputHeight)
    return () => window.removeEventListener('resize', calculateInputHeight)
  }, [])

  return (
    <div className="flex h-screen flex-col">
      <div className="border-border bg-background/95 flex-shrink-0 border-b backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="mr-4">
              <h1 className="text-foreground text-xl font-semibold">{t.ai.chat.title}</h1>
              <p className="text-muted-foreground text-sm">{t.ai.chat.description}</p>
            </div>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={startNewConversation}>{t.ai.chat.actions.newChat}</Button>
            )}
          </div>
        </div>
      </div>

      <Conversation className="flex-1" style={{ paddingBottom: `${inputAreaHeight}px` }}>
        <ConversationContent className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 ? (
            <ConversationEmptyState title={t.ai.chat.welcomeMessage} description={t.ai.chat.description} icon={<MessageSquareIcon className="size-6" />} />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts && message.parts.length > 0 ? (
                    message.parts.map((part: any, i: number) => {
                      if (part.type === 'text') return <Response key={`${message.id}-${i}`}>{part.text}</Response>
                      return null
                    })
                  ) : (
                    <Response>{(message as any).content || ''}</Response>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {error && (
            <div className="mx-auto max-w-3xl px-4 py-4">
              <div className="bg-destructive/10 text-destructive border-destructive/20 flex items-center justify-between rounded-lg border p-4">
                <div className="flex-1">
                  <p className="font-medium">{t.ai.chat.errors.requestFailed}</p>
                  <p className="mt-1 text-sm opacity-90">{error.message || t.ai.chat.errors.unknownError}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => regenerate()} disabled={status === 'streaming'}>{t.ai.chat.actions.retry}</Button>
                  <Button variant="ghost" size="sm" onClick={() => { if (messages.length > 0) setMessages(messages.slice(0, -1)) }}>{t.ai.chat.actions.dismiss}</Button>
                </div>
              </div>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="bg-background/95 fixed bottom-0 left-0 right-0 border-t p-4 pb-safe backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          <PromptInput onSubmit={handlePromptSubmit}>
            <PromptInputTextarea placeholder={error ? t.ai.chat.errors.inputDisabled : t.ai.chat.placeholder} disabled={error != null} />
            <PromptInputToolbar>
              <PromptInputTools>
                <PromptInputModelSelect
                  value={`${provider}:${model}`}
                  onValueChange={(value) => {
                    const [selectedProvider, selectedModel] = value.split(':')
                    setProvider(selectedProvider as keyof typeof providerModels)
                    setModel(selectedModel)
                  }}
                >
                  <PromptInputModelSelectTrigger><PromptInputModelSelectValue placeholder="Select Model" /></PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    {Object.entries(providerModels).map(([prov, models], index) => (
                      <div key={prov}>
                        {index > 0 && <div className="bg-border my-1 h-px" />}
                        <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium uppercase tracking-wider">
                          {t.ai.chat.providers[prov as keyof typeof t.ai.chat.providers] || prov.charAt(0).toUpperCase() + prov.slice(1)}
                        </div>
                        {models.map((mod: string) => (
                          <PromptInputModelSelectItem key={mod} value={`${prov}:${mod}`}>
                            {(t.ai.chat.models as Record<string, string>)[mod] || mod}
                          </PromptInputModelSelectItem>
                        ))}
                      </div>
                    ))}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
              </PromptInputTools>
              <PromptInputSubmit status={error ? 'error' : status} disabled={error != null} />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}
