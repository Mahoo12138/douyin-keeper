import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'
import type { ImageProviderName, ImageGenerationOptions } from '@libs/ai'

export const Route = createFileRoute('/api/image-generate')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { generateImageResponse, calculateImageCreditCost } = await import('@libs/ai')
          const { creditService, TransactionTypeCode } = await import('@libs/credits')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          const userId = session?.user?.id
          if (!userId) return new Response(JSON.stringify({ error: 'unauthorized', message: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

          const body = await request.json()
          const { prompt, provider = 'qwen', model, negativePrompt, size, aspectRatio, seed, promptExtend, watermark, numInferenceSteps, guidanceScale } = body

          if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) return new Response(JSON.stringify({ error: 'invalid_prompt', message: 'Prompt is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

          const creditBalance = await creditService.getBalance(userId)
          const creditCost = calculateImageCreditCost({ provider, model })
          if (creditBalance < creditCost) return new Response(JSON.stringify({ error: 'insufficient_credits', message: 'Not enough credits for image generation.', required: creditCost, balance: creditBalance }), { status: 402, headers: { 'Content-Type': 'application/json' } })

          const normalizedSize = (provider === 'fal' || provider === 'gemini') ? undefined : size
          const normalizedAspectRatio = (provider === 'fal' || provider === 'gemini') ? (aspectRatio || size || '1:1') : undefined

          const consumeResult = await creditService.consumeCredits({ userId, amount: creditCost, description: TransactionTypeCode.AI_IMAGE_GENERATION, metadata: { provider, model, prompt: prompt.trim().substring(0, 100) } })
          if (!consumeResult.success) return new Response(JSON.stringify({ error: 'credit_consumption_failed', message: consumeResult.error || 'Failed to consume credits.', required: creditCost, balance: consumeResult.newBalance }), { status: 402, headers: { 'Content-Type': 'application/json' } })

          const options: ImageGenerationOptions = { prompt: prompt.trim(), provider: provider as ImageProviderName, model, negativePrompt, size: normalizedSize, aspectRatio: normalizedAspectRatio, seed, promptExtend, watermark, numInferenceSteps, guidanceScale }

          let result
          try {
            result = await generateImageResponse(options)
          } catch (generationError) {
            console.error('Image generation failed, refunding credits:', generationError)
            try {
              await creditService.addCredits({ userId, amount: creditCost, type: 'refund', description: 'Refund for failed image generation', metadata: { originalTransactionId: consumeResult.transactionId, provider, model, error: generationError instanceof Error ? generationError.message : 'Unknown error' } })
            } catch (refundError) {
              console.error('CRITICAL: Failed to refund credits:', { userId, amount: creditCost, originalTransactionId: consumeResult.transactionId, refundError })
            }
            throw generationError
          }

          return new Response(JSON.stringify({ success: true, data: result, credits: { consumed: creditCost, remaining: consumeResult.newBalance } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (error) {
          console.error('Image generation API error:', error)
          return new Response(JSON.stringify({ error: 'generation_failed', message: error instanceof Error ? error.message : 'Unknown error occurred' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
        }
      }),
    },
  },
})
