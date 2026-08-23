import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'
import type { VideoProviderName, VideoGenerationOptions } from '@libs/ai'
import { config } from '@config'

export const Route = createFileRoute('/api/video-generate/')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { generateVideoResponse, createVideoTask, calculateVideoCreditCost } = await import('@libs/ai')
          const { createVideoTaskRecord } = await import('@libs/ai/video-task-store')
          const { creditService, TransactionTypeCode } = await import('@libs/credits')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          const userId = session?.user?.id
          if (!userId) {
            return new Response(
              JSON.stringify({ error: 'unauthorized', message: 'Authentication required' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const body = await request.json()
          const {
            prompt,
            provider = config.aiVideo.defaultProvider,
            model, size, aspectRatio, duration, seed,
            loop, motionStrength, promptExtend, watermark,
            firstFrameUrl, lastFrameUrl,
          } = body

          if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return new Response(
              JSON.stringify({ error: 'invalid_prompt', message: 'Prompt is required' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const options: VideoGenerationOptions = {
            prompt: prompt.trim(), provider: provider as VideoProviderName,
            model, size, aspectRatio, duration, seed,
            loop, motionStrength, promptExtend, watermark,
            firstFrameUrl, lastFrameUrl,
          }

          const creditBalance = await creditService.getBalance(userId)
          const creditCost = calculateVideoCreditCost({ provider, model })

          if (creditBalance < creditCost) {
            return new Response(
              JSON.stringify({ error: 'insufficient_credits', message: 'Not enough credits for video generation.', required: creditCost, balance: creditBalance }),
              { status: 402, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const consumeResult = await creditService.consumeCredits({
            userId, amount: creditCost,
            description: TransactionTypeCode.AI_VIDEO_GENERATION,
            metadata: { provider, model, prompt: prompt.trim().substring(0, 100) },
          })

          if (!consumeResult.success) {
            return new Response(
              JSON.stringify({ error: 'credit_consumption_failed', message: consumeResult.error || 'Failed to consume credits.', required: creditCost, balance: consumeResult.newBalance }),
              { status: 402, headers: { 'Content-Type': 'application/json' } }
            )
          }

          if (options.provider !== 'fal') {
            try {
              const asyncTask = await createVideoTask(options)
              const task = createVideoTaskRecord({
                userId, provider: asyncTask.provider, model: asyncTask.model,
                providerTaskId: asyncTask.providerTaskId,
                creditCost, consumeTransactionId: consumeResult.transactionId,
              })
              return new Response(
                JSON.stringify({ success: true, data: { taskId: task.id, status: 'processing', async: true, provider: task.provider, model: task.model }, credits: { consumed: creditCost, remaining: consumeResult.newBalance } }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              )
            } catch (taskError) {
              try {
                await creditService.addCredits({ userId, amount: creditCost, type: 'refund', description: 'Refund for failed video task creation', metadata: { originalTransactionId: consumeResult.transactionId, provider, model, error: taskError instanceof Error ? taskError.message : 'Unknown error' } })
              } catch (refundError) {
                console.error('CRITICAL: Failed to refund credits after task creation failure:', { userId, amount: creditCost, originalTransactionId: consumeResult.transactionId, refundError })
              }
              throw taskError
            }
          }

          let result
          try {
            result = await generateVideoResponse(options)
          } catch (generationError) {
            console.error('Video generation failed, refunding credits:', generationError)
            try {
              await creditService.addCredits({ userId, amount: creditCost, type: 'refund', description: 'Refund for failed video generation', metadata: { originalTransactionId: consumeResult.transactionId, provider, model, error: generationError instanceof Error ? generationError.message : 'Unknown error' } })
            } catch (refundError) {
              console.error('CRITICAL: Failed to refund credits after generation failure:', { userId, amount: creditCost, originalTransactionId: consumeResult.transactionId, refundError })
            }
            throw generationError
          }

          return new Response(
            JSON.stringify({ success: true, data: result, credits: { consumed: creditCost, remaining: consumeResult.newBalance } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        } catch (error) {
          console.error('Video generation API error:', error)
          return new Response(
            JSON.stringify({ error: 'generation_failed', message: error instanceof Error ? error.message : 'Unknown error occurred' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }),
    },
  },
})
