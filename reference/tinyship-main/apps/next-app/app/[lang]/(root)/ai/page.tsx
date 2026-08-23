'use client';

import { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageSquareIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@libs/react-shared/ui/button';
import { config } from '@config';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@libs/react-shared/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageAvatar,
} from '@libs/react-shared/components/ai-elements/message';
import { Response } from '@libs/react-shared/components/ai-elements/response';
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
} from '@libs/react-shared/components/ai-elements/prompt-input';
import '@/app/highlight.css'

export default function Chat() {
  const { t, locale } = useTranslation();
  const initialMessages: any[] = [
    { 
      id: '1', 
      role: 'user',
      parts: [{ type: 'text', text: '你好，我是Grok，一个AI助手。' }]
    },
    { 
      id: '2', 
      role: 'assistant',
      parts: [{ 
        type: 'text', 
        text: `# Hello, Markdown!
  This is a **bold** text with some *italic* content.

  - Item 1
  - Item 2

  \`\`\`javascript
  console.log("Code block");
  \`\`\`
  `
      }]
    },
  ];
  const { messages, sendMessage, setMessages, status, error, regenerate } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  // Use centralized AI configuration from config.ts
  const providerModels = config.ai.availableModels;
  const [provider, setProvider] = useState<keyof typeof providerModels>(config.ai.defaultProvider);
  const [model, setModel] = useState<string>(config.ai.defaultModels[config.ai.defaultProvider]);
  const [hasAccess, setHasAccess] = useState(true); // Default to allow, avoid flicker
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [inputAreaHeight, setInputAreaHeight] = useState(160); // Default height for fixed input area

  // Check user credit balance on page load
  const checkAccessStatus = async () => {
    try {
      const response = await fetch('/api/credits/status', {
        method: 'GET'
      });
      const data = await response.json();
      // User has access if credit balance > 0
      const balance = data?.credits?.balance || 0;
      setHasAccess(balance > 0);
      setCreditBalance(balance);
    } catch (error) {
      // Handle both network errors and JSON parsing errors (like 401 Unauthorized)
      console.warn('Credit check failed, setting to false');
      setHasAccess(false);
      setCreditBalance(0);
    }
  };

  // New conversation function
  const startNewConversation = () => {
    // Reset messages to initial state
    setMessages([]);
  };

  // Enhanced form submission with access check for PromptInput
  const handlePromptSubmit = async (message: { text?: string; files?: any[] }) => {
    if (!message.text?.trim()) return;

    // Check access status (cached from page load)
    if (!hasAccess) {
      // Show no credits toast
      toast.error(t.ai.chat.errors.insufficientCredits || 'Insufficient Credits', {
        description: t.ai.chat.errors.insufficientCreditsDescription || 'You need credits or a subscription to use AI chat.',
        action: {
          label: t.dashboard.credits?.buyMore || t.common.viewPlans,
          onClick: () => {
            // Navigate to pricing page
            window.location.href = `/${locale}/pricing`;
          }
        }
      });
      return;
    }

    // Use sendMessage from useChat with provider and model info
    await sendMessage({
      text: message.text,
    }, {
      body: { provider, model }
    });
    
    // Refresh credit balance after sending (async)
    checkAccessStatus();
  };

  // Calculate input area height dynamically
  const calculateInputHeight = () => {
    const fixedInputElement = document.querySelector('.fixed.bottom-0');
    if (fixedInputElement) {
      const rect = fixedInputElement.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(fixedInputElement);
      
      // Get actual height including padding and border
      const actualHeight = rect.height;
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
      const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
      const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;
      
      const totalHeight = actualHeight + paddingTop + paddingBottom + borderTop + borderBottom + 40; // Extra margin for safety
      
      setInputAreaHeight(totalHeight);
    }
  };

  // Check subscription on mount
  // Note: Scrolling is now handled automatically by AI Elements Conversation component

  useEffect(() => {
    // Check access status (subscription or credits) once on page load
    checkAccessStatus();
    
    // Calculate input height after component mounts
    setTimeout(calculateInputHeight, 100);
    
    // Recalculate on window resize
    window.addEventListener('resize', calculateInputHeight);
    
    return () => {
      window.removeEventListener('resize', calculateInputHeight);
    };
  }, []);
  return (
    <>
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto py-4 px-4">
          <div className="flex items-center justify-between">
            <div className='mr-4'>
              <h1 className="text-xl font-semibold text-foreground">{t.ai.chat.title}</h1>
              <p className="text-sm text-muted-foreground">{t.ai.chat.description}</p>
            </div>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={startNewConversation}
              >
                {t.ai.chat.actions.newChat}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* AI Elements Conversation Container */}
      <Conversation className="flex-1" style={{ paddingBottom: `${inputAreaHeight}px` }}>
        <ConversationContent className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              title={t.ai.chat.welcomeMessage}
              description={t.ai.chat.description}
              icon={<MessageSquareIcon className="size-6" />}
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts && message.parts.length > 0 ? (
                    message.parts.map((part: any, i: number) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <Response key={`${message.id}-${i}`}>
                              {part.text}
                            </Response>
                          );
                        default:
                          return null;
                      }
                    })
                  ) : (
                    // Fallback for messages without parts (like user messages or legacy format)
                    <Response>
                      {(message as any).content || ''}
                    </Response>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          
          {/* Error State */}
          {error && (
            <div className="max-w-3xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium">{t.ai.chat.errors.requestFailed}</p>
                  <p className="text-sm opacity-90 mt-1">
                    {error.message || t.ai.chat.errors.unknownError}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regenerate()}
                    disabled={status === 'streaming'}
                  >
                    {t.ai.chat.actions.retry}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Clear error by removing the last message if it was an error
                      if (messages.length > 0) {
                        setMessages(messages.slice(0, -1));
                      }
                    }}
                  >
                    {t.ai.chat.actions.dismiss}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* AI Elements PromptInput */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur-sm p-4 pb-safe">
        <div className="max-w-3xl mx-auto">
          <PromptInput onSubmit={handlePromptSubmit}>
            <PromptInputTextarea 
              placeholder={error ? t.ai.chat.errors.inputDisabled : t.ai.chat.placeholder}
              disabled={error != null}
            />
            
            <PromptInputToolbar>
              <PromptInputTools>
                {/* Model selector */}
                <PromptInputModelSelect
                  value={`${provider}:${model}`}
                  onValueChange={(value) => {
                    const [selectedProvider, selectedModel] = value.split(':');
                    setProvider(selectedProvider as keyof typeof providerModels);
                    setModel(selectedModel);
                  }}
                >
                  <PromptInputModelSelectTrigger>
                    <PromptInputModelSelectValue placeholder="Select Model" />
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    {Object.entries(providerModels).map(([prov, models], index) => (
                      <div key={prov}>
                        {index > 0 && <div className="h-px bg-border my-1" />}
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
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

              <PromptInputSubmit 
                status={error ? 'error' : status} 
                disabled={error != null}
              />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
    </>
  );
}
