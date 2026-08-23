import { createFileRoute } from '@tanstack/react-router'
import { withCfDb } from '@/lib/with-request-db'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: withCfDb(async ({ request }) => {
        try {
          const { auth } = await import('@libs/auth')
          const { streamResponseWithUsage } = await import('@libs/ai')
          const { creditService, calculateCreditConsumption, safeNumber, TransactionTypeCode } = await import('@libs/credits')
          const { isWorkersRuntime, withFreshRequestClient } = await import('@libs/database')

          const session = await auth.api.getSession({ headers: new Headers(request.headers) })
          const userId = session?.user?.id!
          if (!userId) return new Response('Unauthorized', { status: 401 })

          const body = await request.json()
          const { messages, provider, model } = body
          if (!messages || !Array.isArray(messages)) return new Response('Invalid messages format', { status: 400 })

          const creditBalance = await creditService.getBalance(userId)
          if (creditBalance <= 0) {
            return new Response(
              JSON.stringify({ error: 'insufficient_credits', message: 'No credits available. Please purchase credits to continue.' }),
              { status: 402, headers: { 'Content-Type': 'application/json' } }
            )
          }

          const { response, usage, provider: usedProvider, model: usedModel } = await streamResponseWithUsage({ messages, provider, model })

          // Helper: deduct credits from usage data.
          const consumeCreditsFromUsage = async (usageData: { totalTokens?: number; inputTokens?: number; outputTokens?: number }) => {
            const totalTokens = safeNumber(usageData.totalTokens)
            const inputTokens = safeNumber(usageData.inputTokens)
            const outputTokens = safeNumber(usageData.outputTokens)
            if (totalTokens <= 0) return

            const creditsToConsume = calculateCreditConsumption({ totalTokens, model: usedModel, provider: usedProvider })
            if (!isFinite(creditsToConsume) || creditsToConsume <= 0) return

            await creditService.consumeCredits({
              userId,
              amount: creditsToConsume,
              description: TransactionTypeCode.AI_CHAT,
              metadata: { provider: usedProvider, model: usedModel, inputTokens, outputTokens, totalTokens },
            })
          }

          if (isWorkersRuntime) {
            // In CF Workers the isolate is killed once the Response body stream
            // closes. A floating `.then()` never gets to run. To keep the worker
            // alive we pipe the original stream through a TransformStream and
            // only call `writer.close()` AFTER credit consumption finishes.
            // The Response body (readable side) stays open → worker stays alive.
            const originalBody = response.body!
            const { readable, writable } = new TransformStream()

            ;(async () => {
              const reader = originalBody.getReader()
              const writer = writable.getWriter()
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  await writer.write(value)
                }
                try {
                  const usageData = await usage
                  await withFreshRequestClient(() => consumeCreditsFromUsage(usageData))
                } catch (error) {
                  console.error('Error consuming credits:', error)
                }
              } finally {
                await writer.close()
              }
            })()

            return new Response(readable, {
              headers: response.headers,
              status: response.status,
            })
          }

          // Non-Workers: floating promise is fine — Node keeps the event loop alive.
          usage
            .then(async (usageData) => {
              try { await consumeCreditsFromUsage(usageData) }
              catch (error) { console.error('Error processing credit consumption:', error) }
            })
            .catch((error) => console.error('Error getting usage data:', error))

          return response
        } catch (error) {
          console.error('API route error:', error)
          return new Response('Internal server error', { status: 500 })
        }
      }),
    },
  },
})
