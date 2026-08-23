import { streamResponseWithUsage } from '@libs/ai';
import { auth } from '@libs/auth';
import { 
  creditService, 
  calculateCreditConsumption, 
  safeNumber, 
  TransactionTypeCode 
} from '@libs/credits';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // Get user session for credit tracking
    // Note: Authentication is already verified by authMiddleware (requiresAuth: true)
    // We only need to extract userId here
    const sessionHeaders = new Headers(req.headers);
    const session = await auth.api.getSession({
      headers: sessionHeaders
    });
    
    // userId should always exist since middleware ensures authentication
    const userId = session?.user?.id!;
    
    const body = await req.json();
    console.log('Request body:', body);
    
    const { messages, provider, model } = body;
    
    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      console.error('Invalid messages:', messages);
      return new Response('Invalid messages format', { status: 400 });
    }
    
    // Check credit balance
    const creditBalance = await creditService.getBalance(userId);
    
    if (creditBalance <= 0) {
      return new Response(
        JSON.stringify({ 
          error: 'insufficient_credits',
          message: 'No credits available. Please purchase credits to continue.'
        }), 
        { 
          status: 402, // Payment Required
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log('Processing request:', { 
      messagesCount: messages.length, 
      provider: provider || 'openai', 
      model: model || 'default',
      userId,
      creditBalance
    });
    
    // Get streaming response with usage tracking
    const { response, usage, provider: usedProvider, model: usedModel } = await streamResponseWithUsage({
      messages,
      provider,
      model
    });
    
    // Process credit consumption asynchronously (don't block response)
    usage.then(async (usageData) => {
      try {
        // Use safeNumber to prevent NaN issues
        const totalTokens = safeNumber(usageData.totalTokens);
        const inputTokens = safeNumber(usageData.inputTokens);
        const outputTokens = safeNumber(usageData.outputTokens);
        
        // Skip consumption if no valid token count
        if (totalTokens <= 0) {
          console.warn('Invalid or zero token count, skipping credit consumption:', {
            userId,
            rawTotalTokens: usageData.totalTokens,
            model: usedModel,
            provider: usedProvider
          });
          return;
        }
        
        const creditsToConsume = calculateCreditConsumption({
          totalTokens,
          model: usedModel,
          provider: usedProvider
        });
        
        // Validate calculated credits
        if (!isFinite(creditsToConsume) || creditsToConsume <= 0) {
          console.warn('Invalid credits calculation, skipping consumption:', {
            userId,
            totalTokens,
            creditsToConsume,
            model: usedModel,
            provider: usedProvider
          });
          return;
        }
        
        console.log('Credit consumption:', {
          userId,
          totalTokens,
          creditsToConsume,
          model: usedModel,
          provider: usedProvider
        });
        
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
        });
        
        if (!result.success) {
          console.warn('Credit consumption failed:', result.error);
        }
      } catch (error) {
        console.error('Error processing credit consumption:', error);
      }
    }).catch((error) => {
      console.error('Error getting usage data:', error);
    });
    
    return response;
  } catch (error) {
    console.error('API route error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
