import {
  generateVideoResponse,
  createVideoTask,
  calculateVideoCreditCost,
} from '@libs/ai';
import { createVideoTaskRecord } from '@libs/ai/video-task-store';
import type { VideoProviderName, VideoGenerationOptions } from '@libs/ai';
import { auth } from '@libs/auth';
import { creditService, TransactionTypeCode } from '@libs/credits';
import { config } from '@config';

// Allow longer timeout for video generation (10 minutes)
export const maxDuration = 600;

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
      provider = config.aiVideo.defaultProvider,
      model,
      size,
      aspectRatio,
      duration,
      seed,
      loop,
      motionStrength,
      promptExtend,
      watermark,
      firstFrameUrl,
      lastFrameUrl,
    } = body;
    
    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'invalid_prompt', message: 'Prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Build generation options
    const options: VideoGenerationOptions = {
      prompt: prompt.trim(),
      provider: provider as VideoProviderName,
      model,
      size,
      aspectRatio,
      duration,
      seed,
      loop,
      motionStrength,
      promptExtend,
      watermark,
      firstFrameUrl,
      lastFrameUrl,
    };

    // Check credit balance
    const creditBalance = await creditService.getBalance(userId);
    const creditCost = calculateVideoCreditCost({ provider, model });
    
    if (creditBalance < creditCost) {
      return new Response(
        JSON.stringify({ 
          error: 'insufficient_credits',
          message: 'Not enough credits for video generation.',
          required: creditCost,
          balance: creditBalance
        }), 
        { 
          status: 402,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log('Video generation request:', { 
      provider,
      model,
      duration,
      userId,
      creditBalance,
      creditCost
    });
    
    // Consume credits BEFORE generation to prevent race conditions
    const consumeResult = await creditService.consumeCredits({
      userId,
      amount: creditCost,
      description: TransactionTypeCode.AI_VIDEO_GENERATION,
      metadata: {
        provider,
        model,
        prompt: prompt.trim().substring(0, 100),
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
    
    // For providers that support async task polling, return task id immediately.
    if (options.provider !== 'fal') {
      try {
        const asyncTask = await createVideoTask(options);
        const task = createVideoTaskRecord({
          userId,
          provider: asyncTask.provider,
          model: asyncTask.model,
          providerTaskId: asyncTask.providerTaskId,
          creditCost,
          consumeTransactionId: consumeResult.transactionId,
        });

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              taskId: task.id,
              status: 'processing',
              async: true,
              provider: task.provider,
              model: task.model,
            },
            credits: {
              consumed: creditCost,
              remaining: consumeResult.newBalance
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      } catch (taskError) {
        // Refund consumed credits when task creation fails.
        try {
          await creditService.addCredits({
            userId,
            amount: creditCost,
            type: 'refund',
            description: 'Refund for failed video task creation',
            metadata: {
              originalTransactionId: consumeResult.transactionId,
              provider,
              model,
              error: taskError instanceof Error ? taskError.message : 'Unknown error',
            }
          });
        } catch (refundError) {
          console.error('CRITICAL: Failed to refund credits after task creation failure:', {
            userId,
            amount: creditCost,
            originalTransactionId: consumeResult.transactionId,
            refundError
          });
        }
        throw taskError;
      }
    }

    // Fal keeps synchronous behavior.
    let result;
    try {
      result = await generateVideoResponse(options);
    } catch (generationError) {
      // Refund credits on generation failure
      console.error('Video generation failed, refunding credits:', generationError);
      
      try {
        await creditService.addCredits({
          userId,
          amount: creditCost,
          type: 'refund',
          description: 'Refund for failed video generation',
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
          remaining: consumeResult.newBalance
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Video generation API error:', error);
    
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
