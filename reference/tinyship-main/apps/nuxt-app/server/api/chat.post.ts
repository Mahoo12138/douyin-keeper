import { streamResponseWithUsage } from '@libs/ai'
import { 
  creditService, 
  calculateCreditConsumption,
  safeNumber,
  TransactionTypeCode
} from '@libs/credits'

export default defineEventHandler(async (event) => {
  // Only allow POST requests
  if (getMethod(event) !== 'POST') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed'
    })
  }

  try {
    // Get user from context (set by permissions middleware)
    // Note: Authentication is already verified by middleware (requiresAuth: true)
    const user = event.context.user
    
    // userId should always exist since middleware ensures authentication
    const userId = user?.id!

    // Read the request body
    const { messages, provider, model } = await readBody(event)

    // Validate required fields
    if (!messages || !Array.isArray(messages)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Messages array is required'
      })
    }

    // Check credit balance
    const creditBalance = await creditService.getBalance(userId)
    
    if (creditBalance <= 0) {
      throw createError({
        statusCode: 402, // Payment Required
        statusMessage: 'Insufficient Credits',
        data: {
          error: 'insufficient_credits',
          message: 'No credits available. Please purchase credits to continue.'
        }
      })
    }

    // Log the request for debugging
    console.log('Chat API request:', { 
      messageCount: messages.length, 
      provider: provider || 'openai', 
      model: model || 'gpt-5',
      userId,
      creditBalance
    })

    // Get streaming response with usage tracking
    const { response, usage, provider: usedProvider, model: usedModel } = await streamResponseWithUsage({
      messages,
      provider: provider || undefined,
      model: model || undefined
    })

    // Process credit consumption asynchronously (don't block response)
    usage.then(async (usageData) => {
      try {
        // Use safeNumber to prevent NaN issues
        const totalTokens = safeNumber(usageData.totalTokens)
        const inputTokens = safeNumber(usageData.inputTokens)
        const outputTokens = safeNumber(usageData.outputTokens)
        
        // Skip consumption if no valid token count
        if (totalTokens <= 0) {
          console.warn('Invalid or zero token count, skipping credit consumption:', {
            userId,
            rawTotalTokens: usageData.totalTokens,
            model: usedModel,
            provider: usedProvider
          })
          return
        }
        
        const creditsToConsume = calculateCreditConsumption({
          totalTokens,
          model: usedModel,
          provider: usedProvider
        })
        
        // Validate calculated credits
        if (!isFinite(creditsToConsume) || creditsToConsume <= 0) {
          console.warn('Invalid credits calculation, skipping consumption:', {
            userId,
            totalTokens,
            creditsToConsume,
            model: usedModel,
            provider: usedProvider
          })
          return
        }
        
        console.log('Credit consumption:', {
          userId,
          totalTokens,
          creditsToConsume,
          model: usedModel,
          provider: usedProvider
        })
        
        // Use type code for description (i18n at display time)
        // All details are stored in metadata
        const result = await creditService.consumeCredits({
          userId,
          amount: creditsToConsume,
          description: TransactionTypeCode.AI_CHAT,
          metadata: {
            provider: usedProvider,
            model: usedModel,
            inputTokens,
            outputTokens,
            totalTokens
          }
        })
        
        if (!result.success) {
          console.warn('Credit consumption failed:', result.error)
        }
      } catch (error) {
        console.error('Error processing credit consumption:', error)
      }
    }).catch((error) => {
      console.error('Error getting usage data:', error)
    })

    return response

  } catch (error: any) {
    console.error('Chat API error:', error)
    
    // Handle different types of errors
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    })
  }
})
