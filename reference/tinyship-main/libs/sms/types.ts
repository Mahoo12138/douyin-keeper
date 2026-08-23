/**
 * 短信服务提供商类型
 */
export type SMSProvider = 'aliyun' | 'twilio' | 'tencent';

/**
 * 统一的短信发送选项接口
 */
export interface SMSOptions {
  to: string;               // 接收短信的手机号码
  message?: string;         // 短信内容（Twilio等直接发送内容的服务商需要）
  from?: string;           // 发送方号码（某些服务商需要）
  templateCode?: string;    // 模板代码（阿里云等模板服务商需要）
  templateParams?: Record<string, string>; // 模板参数（用于填充模板中的变量）
  templateParamSet?: string[]; // Ordered template values (Tencent positional placeholders)
  provider?: SMSProvider;  // 服务提供商，默认为 aliyun
}

/**
 * 阿里云短信特定选项（使用模板机制）
 */
export interface AliyunSMSOptions extends Omit<SMSOptions, 'message'> {
  templateCode: string;    // 阿里云模板代码（必须）
  templateParams?: Record<string, string>; // 模板参数
}

/**
 * Twilio短信特定选项（直接发送内容）
 */
export interface TwilioSMSOptions extends Omit<SMSOptions, 'templateCode' | 'templateParams'> {
  message: string;         // 短信内容（必须）
  from?: string;          // 发送方号码
}

/**
 * Tencent Cloud SMS options (template-based, similar to Aliyun)
 */
export interface TencentSMSOptions extends Omit<SMSOptions, 'message'> {
  templateCode: string;
  templateParams?: Record<string, string>;
  templateParamSet?: string[];
}

/**
 * 统一的短信发送响应接口
 */
export interface SMSResponse {
  success: boolean;        // 发送是否成功
  messageId?: string;      // 消息ID
  requestId?: string;      // 请求ID
  error?: {
    message: string;
    name: string;
    provider?: SMSProvider;
  } | null;
} 