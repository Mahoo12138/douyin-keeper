import { PaymentProvider, PaymentParams, PaymentResult, WebhookVerification, PaymentPlan } from '../types';
import { config } from '@config';
import type { CreditPlan, Plan } from '@config';
import { db } from '@libs/database';
import { order, orderStatus } from '@libs/database/schema/order';
import { subscription, subscriptionStatus, paymentTypes } from '@libs/database/schema/subscription';
import { eq, and, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { utcNow } from '@libs/database/utils/utc';
import crypto from 'crypto';
import { X509Certificate } from '@peculiar/x509';
import { ofetch } from 'ofetch';
import { creditService, TransactionTypeCode } from '@libs/credits';
import { processReferralCommission } from '@libs/affiliate';
import { getPlanById } from '@libs/pricing';

// 微信支付分为两大部分 ：https://pay.weixin.qq.com/doc/v3/merchant/4012365342 特别注意这个文档中的图
// 1 发送请求 生成签名
// 2 接受回调，验证签名

// 商户 API 证书，是用来证实商户身份的。证书中包含商户号、证书序列号、证书有效期等信息，由证书授权机构（Certificate Authority ，简称 CA）签发，以防证书被伪造或篡改。
//  详情见 什么是商户API证书？如何获取商户API证书？ 。 https://pay.weixin.qq.com/doc/v3/merchant/4013053053
// 🔑 证书通过环境变量安全存储，避免在代码库中暴露敏感信息。

// 商户 API 私钥。你申请商户 API 证书时，会生成商户私钥。为了证明 API 请求是由你发送的，你应使用商户 API 私钥对请求进行签名。现在通过环境变量 WECHAT_PAY_PRIVATE_KEY 提供。
// 🔑 私钥通过环境变量安全存储，避免在代码库中暴露敏感信息。
// 这两个是一对儿的，有效期是 5 年，到期以后要重新申请。

// 证书还有一个序列号。每个证书都有一个由 CA 颁发的唯一编号，即证书序列号。可以通过账户中心 => API安全 => 商户API证书 => 管理证书 获取。
// 在我们的程序中，不用传入，我们是通过 getSerialNumber 方法直接获取的

// 发送请求，使用 sign 方法进行加密，这个方法其实只需要用到  商户 API 私钥

// 接下来是验证签名，是用来验证回调的签名的。有两种方式
// 1 通过平台证书验证 https://pay.weixin.qq.com/doc/v3/merchant/4013053420
// 2 通过微信支付公钥验证 https://pay.weixin.qq.com/doc/v3/merchant/4013053249 （这个是新的方式，更被推荐，因为平台证书有五年有效期）

// 微信支付平台证书。微信支付平台证书是指：由微信支付负责申请，包含微信支付平台标识、公钥信息的证书。你需使用微信支付平台证书中的公钥验证 API 应答和回调通知的签名。
// 在我们目前的实现中，我们通过 fetchPlatformCertificates 方法获取平台证书，其实就是直接调用了一个官方 API 将证书下载了。
// https://pay.weixin.qq.com/doc/v3/merchant/4012551764

// 通过微信支付公钥验证, 和支付平台证书流程是完全一样的，只不过是换了一个证书。这个证书没有有效期，所以是官方更推荐的使用方式。
// 但是我们需要多提供一个环境变量，因为它不能直接获取。

// 最后还有一步是解密回调报文 https://pay.weixin.qq.com/doc/v3/partner/4012082320
// 方法名称为 decryptWebhookData，要使用到的是 this.apiKey，称之为 APIv3密钥 https://pay.weixin.qq.com/doc/v3/merchant/4013053267
// 密钥为32个字符，支持数字和大小写字母组合

// 微信支付回调响应类型 
interface WechatPayNotification {
  id: string;
  create_time: string;
  resource_type: 'encrypt-resource';
  event_type: 'TRANSACTION.SUCCESS' | 'TRANSACTION.CLOSED' | 'REFUND.SUCCESS' | 'REFUND.CLOSED';
  summary: string;
  resource: {
    original_type: 'transaction' | 'refund';
    algorithm: 'AEAD_AES_256_GCM';
    ciphertext: string;
    associated_data: string;
    nonce: string;
  };
}

// 解密后的交易信息
interface WechatPaymentTransaction {
  mchid: string;
  appid: string;
  out_trade_no: string;
  transaction_id: string;
  trade_type: string;
  trade_state: string;
  trade_state_desc: string;
  bank_type: string;
  success_time: string;
  payer: {
    openid: string;
  };
  amount: {
    total: number;
    payer_total: number;
    currency: string;
    payer_currency: string;
  };
}

// 微信支付回调请求类型
interface WechatPayWebhookRequest {
  headers: {
    'wechatpay-signature': string;
    'wechatpay-timestamp': string;
    'wechatpay-nonce': string;
    'wechatpay-serial': string;
  };
  body: string;
}

export class WechatPayProvider implements PaymentProvider {
  private appId: string;
  private mchId: string;
  private apiKey: string;
  private notifyUrl: string;
  private privateKey: Buffer;
  private publicKey: Buffer;
  private serialNo: string;
  private baseUrl = 'https://api.mch.weixin.qq.com';
  private platformCertificates: Map<string, string> = new Map();
  private paymentPublicKey?: Buffer;
  private publicKeyId?: string;

  constructor() {
    this.appId = config.payment.providers.wechat.appId;
    this.mchId = config.payment.providers.wechat.mchId;
    this.apiKey = config.payment.providers.wechat.apiKey;
    this.notifyUrl = config.payment.providers.wechat.notifyUrl;
    
    console.log('Loading WeChat Pay certificates from environment variables');
    
    try {
      // Load certificates from environment variables via config
      this.privateKey = config.payment.providers.wechat.privateKey;
      this.publicKey = config.payment.providers.wechat.publicKey;
      
      // Load WeChat Pay payment public key and ID (optional, new verification method)
      // 如果配置了这两个，将优先使用公钥验证，可以跳过平台证书初始化以提高性能
      this.paymentPublicKey = config.payment.providers.wechat.paymentPublicKey;
      this.publicKeyId = config.payment.providers.wechat.publicKeyId;
      
      // 从证书中获取序列号
      this.serialNo = this.getSerialNumber(this.publicKey);
      console.log('Certificate serial number:', this.serialNo);
      
      // Log which verification methods are available
      if (this.paymentPublicKey && this.publicKeyId) {
        console.log('WeChat Pay public key verification is available (recommended)');
        console.log('Public key ID:', this.publicKeyId);
        console.log('Platform certificates will be fetched on-demand if needed');
      } else {
        console.log('WeChat Pay public key verification not configured, using platform certificates only');
        console.log('Platform certificates will be fetched on-demand when needed');
      }
      
      // 移除异步初始化，改为按需获取
      // 理由：
      // 1. 大多数情况下实例创建后立即调用方法，证书还没获取完成
      // 2. 每次 createPaymentProvider 都创建新实例，重复获取证书
      // 3. 现在有了微信支付公钥验证作为首选方案
      // 4. 平台证书在 verifySignature 中按需获取更合理
      
    } catch (error) {
      console.error('Error loading certificates from environment variables:', error);
      throw new Error('Failed to load WeChat Pay certificates. Please ensure WECHAT_PAY_PRIVATE_KEY_BASE64 and WECHAT_PAY_PUBLIC_KEY_BASE64 are set correctly.');
    }
  }

  private getSerialNumber(certificateData: Buffer): string {
    try {
      // Convert Buffer to Uint8Array for @peculiar/x509 compatibility with Node.js 22+
      const certificate = new X509Certificate(new Uint8Array(certificateData));
      return certificate.serialNumber;
    } catch (error) {
      console.error('Error getting certificate serial number:', error);
      throw new Error('Failed to get certificate serial number');
    }
  }

  // https://pay.weixin.qq.com/doc/v3/merchant/4012365336
  private async sign(method: string, path: string, timestamp: string, nonce: string, body?: string) {
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body || ''}\n`;
    console.log('message:', JSON.stringify(message));
    const signature = crypto.createSign('RSA-SHA256')
      .update(message)
      .sign(this.privateKey, 'base64');
    return signature;
  }



  private async fetchPlatformCertificates() {
    try {
      // 获取证书时跳过签名验证，避免循环依赖
      const response = await this.request('GET', '/v3/certificates', undefined, true);

      if (response.data) {
        for (const item of response.data) {
          const decryptedCertificate = this.decryptWebhookData<string>(
            item.encrypt_certificate.ciphertext,
            item.encrypt_certificate.associated_data,
            item.encrypt_certificate.nonce
          );
          
          // 使用 X509Certificate 解析证书并获取公钥
          // Convert to Uint8Array for @peculiar/x509 compatibility with Node.js 22+
          const certificate = new X509Certificate(new Uint8Array(Buffer.from(decryptedCertificate)));
          this.platformCertificates.set(item.serial_no, certificate.publicKey.toString());
        }
        
        console.log('Successfully updated platform certificates');
      }
    } catch (error) {
      console.error('Failed to fetch platform certificates:', error);
      throw error;
    }
  }
  // Signature verification with support for both WeChat Pay public key and platform certificates
  // https://pay.weixin.qq.com/doc/v3/merchant/4013053249 (WeChat Pay public key - recommended)
  // https://pay.weixin.qq.com/doc/v3/merchant/4013053420 (Platform certificates - legacy)
  private async verifySignature(timestamp: string, nonce: string, body: string, signature: string, serialNo: string): Promise<boolean> {
    const message = `${timestamp}\n${nonce}\n${body}\n`;
    
    // Method 1: Try WeChat Pay public key verification (recommended)
    // Check if the serial number matches our configured public key ID
    if (this.paymentPublicKey && this.publicKeyId && serialNo === this.publicKeyId) {
      console.log('Using WeChat Pay public key verification (recommended method)');
      
      try {
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(message);
        const isValid = verify.verify(this.paymentPublicKey, signature, 'base64');
        
        if (isValid) {
          console.log('WeChat Pay public key verification successful');
          return true;
        } else {
          console.warn('WeChat Pay public key verification failed');
          // Don't return false immediately, try platform certificate method as fallback
        }
      } catch (error) {
        console.error('Error during WeChat Pay public key verification:', error);
        // Continue to platform certificate verification as fallback
      }
    }
    
    // Method 2: Fallback to platform certificate verification (legacy)
    console.log('Using platform certificate verification (fallback method)');
    
    // 获取对应序列号的平台证书公钥
    let platformPublicKey = this.platformCertificates.get(serialNo);
    
    // 如果找不到证书，尝试获取平台证书
    if (!platformPublicKey) {
      console.log('Platform certificate not found, attempting to fetch...');
      try {
        // 如果之前跳过了平台证书初始化（因为配置了公钥验证），现在需要动态获取
        if (this.platformCertificates.size === 0) {
          console.log('Platform certificates not initialized, initializing now as fallback...');
        }
        await this.fetchPlatformCertificates();
        platformPublicKey = this.platformCertificates.get(serialNo);
      } catch (error) {
        console.error('Failed to fetch platform certificates:', error);
      }
    }

    if (!platformPublicKey) {
      console.error('Platform certificate not found for serial number:', serialNo);
      return false;
    }

    try {
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(message);
      const isValid = verify.verify(platformPublicKey, signature, 'base64');
      
      if (isValid) {
        console.log('Platform certificate verification successful');
      } else {
        console.warn('Platform certificate verification failed');
      }
      
      return isValid;
    } catch (error) {
      console.error('Error during platform certificate verification:', error);
      return false;
    }
  }

  /**
   * 验证微信支付应答签名
   * 根据微信官方文档：https://pay.weixin.qq.com/doc/v3/merchant/4012365342
   * 微信支付应答商户的请求时，商户需要验签
   */
  private async verifyResponseSignature(response: any): Promise<boolean> {
    try {
      // 获取响应头中的签名信息
      const wechatpayTimestamp = response.headers.get('wechatpay-timestamp');
      const wechatpayNonce = response.headers.get('wechatpay-nonce');
      const wechatpaySignature = response.headers.get('wechatpay-signature');
      const wechatpaySerial = response.headers.get('wechatpay-serial');

      // 检查必要的签名头是否存在
      if (!wechatpayTimestamp || !wechatpayNonce || !wechatpaySignature || !wechatpaySerial) {
        console.warn('Missing WeChat Pay signature headers in response');
        return false;
      }

      // 获取响应体
      // 根据微信支付签名验证规则：
      // - 如果响应体为空（如 204 No Content），使用空字符串
      // - 如果响应体是字符串，直接使用
      // - 如果响应体是对象，序列化为 JSON 字符串
      let responseBody = '';
      if (response._data === null || response._data === undefined) {
        responseBody = '';
      } else if (typeof response._data === 'string') {
        responseBody = response._data;
      } else {
        responseBody = JSON.stringify(response._data);
      }

      console.log('Verifying response signature:', {
        timestamp: wechatpayTimestamp,
        nonce: wechatpayNonce,
        serial: wechatpaySerial,
        statusCode: response.status,
        bodyLength: responseBody.length,
        isEmpty: responseBody === ''
      });

      // 使用现有的 verifySignature 方法验证签名
      return await this.verifySignature(
        wechatpayTimestamp,
        wechatpayNonce,
        responseBody,
        wechatpaySignature,
        wechatpaySerial
      );
    } catch (error) {
      console.error('Error verifying response signature:', error);
      return false;
    }
  }

  /**
   * 发送请求到微信支付API
   * @param method HTTP方法
   * @param path API路径
   * @param data 请求体数据
   * @param skipSignatureVerification 是否跳过响应签名验证（用于避免循环依赖，如获取证书时）
   */
  private async request(method: string, path: string, data?: any, skipSignatureVerification = false) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const url = `${this.baseUrl}${path}`;
    const body = data ? JSON.stringify(data) : '';
    
    const signature = await this.sign(method, path, timestamp, nonce, body);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Language': 'zh-CN',
      'User-Agent': 'TinyShip/1.0',
      'Authorization': `WECHATPAY2-SHA256-RSA2048 mchid="${this.mchId}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.serialNo}"`,
      // https://pay.weixin.qq.com/doc/v3/merchant/4012154180#5.2-%E5%88%87%E6%8D%A2%E9%AA%8C%E7%AD%BE%E5%92%8C%E5%AE%9E%E7%8E%B0%E5%9B%9E%E8%B0%83%E5%85%BC%E5%AE%B9
      'Wechatpay-Serial': this.publicKeyId ? this.publicKeyId : this.serialNo
    };

    console.log('Request details:', {
      url,
      method,
      headers,
      body: data
    });

    try {
      // 使用 ofetch 获取完整响应（包含响应头）
      const response = await ofetch.raw(url, {
        method,
        body: data,
        headers
      });

      console.log('Response details:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: response._data
      });

      // 验证响应签名（除非明确跳过）
      // 根据微信官方文档：https://pay.weixin.qq.com/doc/v3/merchant/4013053249
      // 微信支付会在极少数应答中生成错误签名以探测商户系统是否正确验证签名
      if (!skipSignatureVerification) {
        const isSignatureValid = await this.verifyResponseSignature(response);
        if (!isSignatureValid) {
          console.warn('WeChat Pay response signature verification failed, but continuing...');
          // 签名验证失败时的处理策略：
          // 1. 记录警告日志以便监控和调试
          // 2. 不直接抛出错误，因为可能是微信的签名探测流量
          // 3. 在生产环境中，可以根据业务需求决定是否要舍弃该应答
        }
      } else {
        console.log('Skipping response signature verification for this request');
      }

      return response._data;
    } catch (error: any) {
      console.error('Response error details:', {
        status: error.status,
        statusText: error.statusText,
        message: error.message,
        data: error.data
      });
      throw error;
    }
  }

  async createPayment(params: PaymentParams): Promise<PaymentResult> {
    const plan = (params.plan || config.payment.plans[params.planId as keyof typeof config.payment.plans]) as Plan | undefined;
    if (!plan) {
      throw new Error(`Plan not found: ${params.planId}`);
    }
    const description = params.metadata?.description || `${plan.i18n['zh-CN']?.name} - ${plan.i18n['zh-CN']?.description}`;
    
    try {
      const data = {
        appid: this.appId,
        mchid: this.mchId,
        description,
        out_trade_no: params.orderId,
        notify_url: this.notifyUrl,
        amount: {
          total: Math.round(params.amount as number * 100),
          currency: 'CNY'
        },
        scene_info: {
          payer_client_ip: params.metadata?.clientIp || '127.0.0.1'
        }
      };

      const result = await this.request('POST', '/v3/pay/transactions/native', data);

      if (result.code_url) {
        return {
          paymentUrl: result.code_url,
          providerOrderId: params.orderId,
          metadata: { result }
        };
      } else {
        throw new Error(`微信支付下单失败: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.error('微信支付创建订单失败:', error);
      throw error;
    }
  }

  private decryptWebhookData<T extends any>(ciphertext: string, associated_data: string, nonce: string): T {
    const _ciphertext = Buffer.from(ciphertext, 'base64');

    // 解密 ciphertext字符  AEAD_AES_256_GCM算法
    const authTag = _ciphertext.subarray(_ciphertext.length - 16);
    const data = _ciphertext.subarray(0, _ciphertext.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.apiKey, nonce);
    decipher.setAuthTag(new Uint8Array(authTag));
    decipher.setAAD(new Uint8Array(Buffer.from(associated_data)));
    const decoded = decipher.update(new Uint8Array(data), undefined, 'utf8');

    try {
      return JSON.parse(decoded);
    } catch (e) {
      return decoded as T;
    }
  }

  /**
   * 关闭微信支付订单
   * @param orderId 商户订单号
   * @returns 是否成功关闭
   */
  async closeOrder(orderId: string): Promise<boolean> {
    try {
      // 关闭订单API需要在请求体中包含商户号
      const data = {
        mchid: this.mchId
      };
      
      const response = await this.request('POST', `/v3/pay/transactions/out-trade-no/${orderId}/close`, data);
      
      // 关闭订单成功时返回204状态码，无响应体
      // 当使用ofetch时，204状态码会返回空对象 {}
      console.log('Close order response:', response);
      
      // 更新本地订单状态
      try {
        await db.update(order)
          .set({ 
            status: orderStatus.CANCELED,
            updatedAt: new Date()
          })
          .where(eq(order.id, orderId));
      } catch (dbError) {
        console.error('更新订单状态失败:', dbError);
        // 即使数据库更新失败，只要微信那边关闭成功，我们仍然返回true
      }
      
      return true;
    } catch (error) {
      console.error('关闭微信支付订单失败:', error);
      return false;
    }
  }

  async handleWebhook(payload: string | Record<string, any>, signature: string): Promise<WebhookVerification> {
    try {
      const { headers, body } = typeof payload === 'string' ? { headers: {}, body: payload } : payload;
      const timestamp = headers['wechatpay-timestamp'];
      const nonce = headers['wechatpay-nonce'];
      
      console.log('Webhook verification details:', {
        timestamp,
        nonce,
        body,
        signature,
        headers
      });
      
      const isValid = await this.verifySignature(timestamp, nonce, body, signature, headers['wechatpay-serial']);

      if (!isValid) {
        console.error('微信支付回调签名验证失败');
        // 根据微信官方文档，签名验证失败的回调应该返回失败状态
        // 这会让微信支付重新发送带有正确签名的通知回调
        // 参考：https://pay.weixin.qq.com/doc/v3/merchant/4013053249
        return { success: false };
      }

      const notification = JSON.parse(body) as WechatPayNotification;
      
      // 处理支付成功通知
      if (notification.event_type === 'TRANSACTION.SUCCESS') {
        // 解密回调数据
        const decryptedData = this.decryptWebhookData<WechatPaymentTransaction>(
          notification.resource.ciphertext,
          notification.resource.associated_data,
          notification.resource.nonce
        );

        console.log('Decrypted webhook data:', decryptedData);
        
        // 使用解密后的订单号
        const orderId = decryptedData.out_trade_no;
        
        // 更新订单状态
        await db.update(order)
          .set({ 
            status: orderStatus.PAID,
            providerOrderId: decryptedData.transaction_id,
            updatedAt: new Date()
          })
          .where(eq(order.id, orderId));

        await processReferralCommission(orderId);
          
        // 获取订单信息
        const orderRecord = await db.query.order.findFirst({
          where: eq(order.id, orderId)
        });
        
        if (orderRecord) {
          const plan = (await getPlanById(orderRecord.planId) || config.payment.plans[orderRecord.planId as keyof typeof config.payment.plans]) as PaymentPlan;
          const now = utcNow();
          
          // Handle credit pack purchase
          if (plan.duration.type === 'credits' && plan.credits) {
            console.log(`WeChat credit pack purchase - Adding ${plan.credits} credits to user ${orderRecord.userId}`);
            
            await creditService.addCredits({
              userId: orderRecord.userId,
              amount: plan.credits,
              type: 'purchase',
              orderId: orderId,
              description: TransactionTypeCode.PURCHASE,
              metadata: {
                transactionId: decryptedData.transaction_id,
                planId: orderRecord.planId,
                provider: 'wechat'
              }
            });
            
            return { success: true, orderId };
          }
          
          // Handle regular subscription payment
          const months = plan.duration.months ?? 1;
          
          // Check if user already has active subscription
          const existingSubscription = await db.query.subscription.findFirst({
            where: and(
              eq(subscription.userId, orderRecord.userId),
              eq(subscription.planId, orderRecord.planId),
              eq(subscription.status, subscriptionStatus.ACTIVE)
            ),
            orderBy: [desc(subscription.periodEnd)]
          });
          
          // Calculate new period end time
          const newPeriodEnd = new Date(now);
          if (months >= 9999) {
            // Lifetime subscription: set to 100 years
            newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 100);
          } else {
            // Regular subscription: add months
            newPeriodEnd.setMonth(newPeriodEnd.getMonth() + months);
          }
          
          if (existingSubscription) {
            // If subscription exists, extend the end date
            const existingPeriodEnd = existingSubscription.periodEnd;
            const extensionStart = existingPeriodEnd > now 
              ? existingPeriodEnd 
              : now;
            
            // Calculate new end time based on extension start
            const extensionEnd = new Date(extensionStart);
            if (months >= 9999) {
              extensionEnd.setFullYear(extensionEnd.getFullYear() + 100);
            } else {
              extensionEnd.setMonth(extensionEnd.getMonth() + months);
            }
            
            await db.update(subscription)
              .set({
                periodEnd: extensionEnd,
                updatedAt: now,
                metadata: JSON.stringify({
                  ...JSON.parse(existingSubscription.metadata || '{}'),
                  renewed: true,
                  lastTransactionId: decryptedData.transaction_id,
                  lastTradeState: decryptedData.trade_state,
                  lastTradeStateDesc: decryptedData.trade_state_desc,
                  lastSuccessTime: decryptedData.success_time,
                  isLifetime: months >= 9999
                })
              })
              .where(eq(subscription.id, existingSubscription.id));
          } else {
            // Create new subscription if none exists
            await db.insert(subscription).values({
              id: randomUUID(),
              userId: orderRecord.userId,
              planId: orderRecord.planId,
              status: subscriptionStatus.ACTIVE,
              paymentType: paymentTypes.ONE_TIME,
              periodStart: now,
              periodEnd: newPeriodEnd,
              cancelAtPeriodEnd: false,
              metadata: JSON.stringify({
                transactionId: decryptedData.transaction_id,
                tradeState: decryptedData.trade_state,
                tradeStateDesc: decryptedData.trade_state_desc,
                successTime: decryptedData.success_time,
                isLifetime: months >= 9999
              })
            });
          }
        }
        
        return { success: true, orderId };
      }
      
      return { success: true };
    } catch (err) {
      console.error('处理微信支付回调失败:', err);
      return { success: false };
    }
  }

  async queryOrder(orderId: string): Promise<{
    status: 'pending' | 'paid' | 'failed';
    transaction?: WechatPaymentTransaction;
  }> {
    try {
      const result = await this.request('GET', `/v3/pay/transactions/out-trade-no/${orderId}?mchid=${this.mchId}`);

      if (result) {
        const transaction = result as WechatPaymentTransaction;
        
        switch (transaction.trade_state) {
          case 'SUCCESS':
            return { status: 'paid', transaction };
          case 'NOTPAY':
          case 'USERPAYING':
            return { status: 'pending', transaction };
          default:
            return { status: 'failed', transaction };
        }
      }

      return { status: 'pending' };
    } catch (err) {
      console.error('查询微信支付订单状态失败:', err);
      return { status: 'failed' };
    }
  }
}
