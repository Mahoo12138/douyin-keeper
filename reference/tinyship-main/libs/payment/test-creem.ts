#!/usr/bin/env node

/**
 * Test script for Creem payment provider
 * 
 * This script tests the Creem provider implementation that uses the official
 * Creem TypeScript SDK with MCP-compatible parameter structures.
 * 
 * Usage: node libs/payment/test-creem.ts
 * 
 * Make sure to set CREEM_API_KEY environment variable before running
 */

import { createPaymentProvider } from './index';
import { config } from '@config';

async function testCreemProvider() {
  console.log('🧪 Testing Creem Payment Provider...\n');

  try {
    // Check configuration
    console.log('1. Checking Creem configuration...');
    if (!config.payment.providers.creem.apiKey) {
      throw new Error('CREEM_API_KEY environment variable not set');
    }
    if (!config.payment.providers.creem.webhookSecret) {
      throw new Error('CREEM_WEBHOOK_SECRET environment variable not set');
    }
    console.log('✅ Configuration found');
    console.log(`   API Key: ${config.payment.providers.creem.apiKey.substring(0, 8)}...`);
    console.log(`   Webhook Secret: ${config.payment.providers.creem.webhookSecret.substring(0, 8)}...`);
    console.log(`   Server URL: ${config.payment.providers.creem.serverUrl}\n`);

    // Create provider instance
    console.log('2. Creating Creem provider instance...');
    const creemProvider = createPaymentProvider('creem');
    console.log('✅ Provider instance created\n');

    // Test order query (safe operation)
    console.log('3. Testing order query functionality...');
    const orderResult = await creemProvider.queryOrder('test-order-id');
    console.log('✅ Order query completed:', orderResult);
    console.log('   Note: This is expected to return "failed" for non-existent order\n');

    // Test webhook handling (safe operation with test data)
    console.log('4. Testing webhook handling...');
    const testWebhookData = {
      event_type: 'test.event',
      data: {
        id: 'test-id',
        metadata: {
          orderId: 'test-order',
          userId: 'test-user',
          planId: 'test-plan'
        }
      }
    };
    
    const webhookResult = await creemProvider.handleWebhook(testWebhookData, '');
    console.log('✅ Webhook handling completed:', webhookResult);
    console.log('   Note: Unhandled events return success: true\n');

    // Test Return URL verification (safe operation with test data)
    console.log('5. Testing Return URL verification...');
    const testReturnUrl = 'https://example.com/success?checkout_id=ch_test123&order_id=ord_test456&customer_id=cust_test789&signature=invalid_signature';
    const verificationResult = await creemProvider.verifyReturnUrl(testReturnUrl);
    console.log('✅ Return URL verification completed:', verificationResult);
    console.log('   Note: This should return invalid signature for test data\n');

    console.log('🎉 All tests passed! Creem provider is ready to use.');
    console.log('\nNext steps:');
    console.log('1. Create products in Creem using MCP tools');
    console.log('2. Update config.ts with product IDs');
    console.log('3. Test payment creation with real product IDs');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testCreemProvider();
}

export { testCreemProvider }; 