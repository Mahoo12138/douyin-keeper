import { generateImageResponse, calculateImageCreditCost } from '@libs/ai'
import type { ImageProviderName, ImageGenerationOptions } from '@libs/ai'
import { auth } from '@libs/auth'
import { creditService, TransactionTypeCode } from '@libs/credits'

export default defineEventHandler(async (event) => {
  try {
    // Get user from context (set by permissions middleware)
    const user = event.context.user || await (async () => {
      const session = await auth.api.getSession({
        headers: new Headers(event.node.req.headers as HeadersInit)
      })
      return session?.user
    })()
    
    // userId should always exist since middleware ensures authentication
    const userId = user?.id
    
    if (!userId) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
        data: {
          error: 'unauthorized',
          message: 'Authentication required'
        }
      })
    }

    // Read the request body
    const body = await readBody(event)
    
    const {
      prompt,
      provider = 'qwen',
      model,
      negativePrompt,
      size,
      aspectRatio,
      seed,
      promptExtend,
      watermark,
      numInferenceSteps,
      guidanceScale,
    } = body

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          error: 'invalid_prompt',
          message: 'Prompt is required'
        }
      })
    }

    // Check credit balance
    const creditBalance = await creditService.getBalance(userId)
    const creditCost = calculateImageCreditCost({ provider, model })
    
    if (creditBalance < creditCost) {
      throw createError({
        statusCode: 402,
        statusMessage: 'Payment Required',
        data: {
          error: 'insufficient_credits',
          message: 'Not enough credits for image generation.',
          required: creditCost,
          balance: creditBalance
        }
      })
    }

    const normalizedSize = (provider === 'fal' || provider === 'gemini') ? undefined : size
    const normalizedAspectRatio = (provider === 'fal' || provider === 'gemini')
      ? (aspectRatio || size || '1:1')
      : undefined

    console.log('Image generation request:', { 
      provider,
      model,
      size: normalizedSize,
      aspectRatio: normalizedAspectRatio,
      userId,
      creditBalance,
      creditCost
    })

    // Consume credits BEFORE generation to prevent race conditions and free generations
    const consumeResult = await creditService.consumeCredits({
      userId,
      amount: creditCost,
      description: TransactionTypeCode.AI_IMAGE_GENERATION,
      metadata: {
        provider,
        model,
        prompt: prompt.trim().substring(0, 100), // Store truncated prompt for reference
      }
    })

    if (!consumeResult.success) {
      throw createError({
        statusCode: 402,
        statusMessage: 'Payment Required',
        data: {
          error: 'credit_consumption_failed',
          message: consumeResult.error || 'Failed to consume credits. Please try again.',
          required: creditCost,
          balance: consumeResult.newBalance
        }
      })
    }

    // Build generation options
    const options: ImageGenerationOptions = {
      prompt: prompt.trim(),
      provider: provider as ImageProviderName,
      model,
      negativePrompt,
      size: normalizedSize,
      aspectRatio: normalizedAspectRatio,
      seed,
      promptExtend,
      watermark,
      numInferenceSteps,
      guidanceScale,
    }

    // Generate image (credits already consumed)
    // If generation fails, we need to refund the credits
    let result
    try {
      result = await generateImageResponse(options)
    } catch (generationError: any) {
      // Refund credits on generation failure
      console.error('Image generation failed, refunding credits:', generationError)
      
      try {
        await creditService.addCredits({
          userId,
          amount: creditCost,
          type: 'refund',
          description: 'Refund for failed image generation',
          metadata: {
            originalTransactionId: consumeResult.transactionId,
            provider,
            model,
            error: generationError instanceof Error ? generationError.message : 'Unknown error',
          }
        })
        console.log('Credits refunded successfully:', { userId, amount: creditCost })
      } catch (refundError) {
        // Log refund failure for manual reconciliation
        console.error('CRITICAL: Failed to refund credits after generation failure:', {
          userId,
          amount: creditCost,
          originalTransactionId: consumeResult.transactionId,
          refundError
        })
      }
      
      throw generationError
    }

    return {
      success: true,
      data: result,
      credits: {
        consumed: creditCost,
        remaining: consumeResult.newBalance  // Use actual balance from consumption result
      }
    }

  } catch (error: any) {
    console.error('Image generation API error:', error)
    
    // Handle different types of errors
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        error: 'generation_failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    })
  }
})
