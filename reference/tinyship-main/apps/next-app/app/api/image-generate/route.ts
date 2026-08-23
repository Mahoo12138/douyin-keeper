import { generateImageResponse, calculateImageCreditCost } from '@libs/ai';
import type { ImageProviderName, ImageGenerationOptions } from '@libs/ai';
import { auth } from '@libs/auth';
import { creditService, TransactionTypeCode } from '@libs/credits';

// Allow longer timeout for image generation
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // Get user session for credit tracking
    const sessionHeaders = new Headers(req.headers);
    const session = await auth.api.getSession({
      headers: sessionHeaders
    });
    
    // userId should always exist since middleware ensures authentication
    const userId = session?.user?.id;
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const body = await req.json();
    
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
    } = body;
    
    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'invalid_prompt', message: 'Prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Check credit balance
    const creditBalance = await creditService.getBalance(userId);
    const creditCost = calculateImageCreditCost({ provider, model });
    
    if (creditBalance < creditCost) {
      return new Response(
        JSON.stringify({ 
          error: 'insufficient_credits',
          message: 'Not enough credits for image generation.',
          required: creditCost,
          balance: creditBalance
        }), 
        { 
          status: 402,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const normalizedSize = (provider === 'fal' || provider === 'gemini') ? undefined : size;
    const normalizedAspectRatio = (provider === 'fal' || provider === 'gemini')
      ? (aspectRatio || size || '1:1')
      : undefined;

    console.log('Image generation request:', { 
      provider,
      model,
      size: normalizedSize,
      aspectRatio: normalizedAspectRatio,
      userId,
      creditBalance,
      creditCost
    });
    
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
    });
    
    if (!consumeResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'credit_consumption_failed',
          message: consumeResult.error || 'Failed to consume credits. Please try again.',
          required: creditCost,
          balance: consumeResult.newBalance
        }), 
        { 
          status: 402,
          headers: { 'Content-Type': 'application/json' }
        }
      );
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
    };
    
    // Generate image (credits already consumed)
    // If generation fails, we need to refund the credits
    let result;
    try {
      result = await generateImageResponse(options);
    } catch (generationError) {
      // Refund credits on generation failure
      console.error('Image generation failed, refunding credits:', generationError);
      
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
        });
        console.log('Credits refunded successfully:', { userId, amount: creditCost });
      } catch (refundError) {
        // Log refund failure for manual reconciliation
        console.error('CRITICAL: Failed to refund credits after generation failure:', {
          userId,
          amount: creditCost,
          originalTransactionId: consumeResult.transactionId,
          refundError
        });
      }
      
      throw generationError;
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        data: result,
        credits: {
          consumed: creditCost,
          remaining: consumeResult.newBalance  // Use actual balance from consumption result
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Image generation API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        error: 'generation_failed',
        message: errorMessage 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
