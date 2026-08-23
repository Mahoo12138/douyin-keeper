import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware, APIError, createAuthEndpoint } from "better-auth/api";
import type { Account, User } from "better-auth";
import { nanoid } from "nanoid";

interface WeChatProfile {
  unionid?: string;
  openid: string;
  nickname: string;
  headimgurl: string;
}

interface WeChatTokens {
  access_token: string;
  openid: string;
  refresh_token: string;
  scope: string;
  errcode?: number;
  errmsg?: string;
}

interface WeChatPluginOptions {
  appId: string;
  appSecret: string;
  callbackUrl?: string;
}

export const wechatPlugin = (options: WeChatPluginOptions): BetterAuthPlugin => {
  return {
    id: "wechat",
    endpoints: {
      // 获取微信登录 URL
      getLoginUrl: createAuthEndpoint("/wechat/login", {
        method: "GET",
      }, async (ctx) => {
        const state = ctx.query?.state || "/";
        const redirectUri = encodeURIComponent(`${ctx.context.baseURL}/oauth2/callback/wechat`);
        const url = `https://open.weixin.qq.com/connect/qrconnect?` +
          `appid=${options.appId}&` +
          `redirect_uri=${redirectUri}&` +
          `response_type=code&` +
          `scope=snsapi_login&` +
          `state=${state}#wechat_redirect`;

        return ctx.json({ url });
      }),

      // 处理微信回调
      handleCallback: createAuthEndpoint("/oauth2/callback/wechat", {
        method: "GET",
      }, async (ctx) => {
        try {
          const code = ctx.query?.code;
          const state = ctx.query?.state;
          
          if (!code || Array.isArray(code)) {
            throw new APIError("BAD_REQUEST", {
              message: "Missing or invalid authorization code",
            });
          }
          
          let returnTo = '/';
          if (state && typeof state === 'string') {
            try {
              const decoded = Buffer.from(state, 'base64').toString('utf-8');
              returnTo = decodeURIComponent(decoded) || '/';
            } catch (e) {
              console.error('Failed to decode state:', e);
              returnTo = '/';
            }
          }

          // 获取访问令牌
          const tokenResponse = await fetch(
            `https://api.weixin.qq.com/sns/oauth2/access_token?` +
            `appid=${options.appId}&` +
            `secret=${options.appSecret}&` +
            `code=${code}&grant_type=authorization_code`
          );

          const tokenData: WeChatTokens = await tokenResponse.json();
          
          if (tokenData.errcode) {
            throw new APIError("BAD_REQUEST", {
              message: `WeChat API error: ${tokenData.errmsg}`,
            });
          }

          // 获取用户信息
          const userInfoResponse = await fetch(
            `https://api.weixin.qq.com/sns/userinfo?` +
            `access_token=${tokenData.access_token}&` +
            `openid=${tokenData.openid}&lang=zh_CN`
          );
          
          const profile: WeChatProfile = await userInfoResponse.json();
          
          if (!profile || !profile.openid) {
            throw new APIError("BAD_REQUEST", {
              message: "Failed to get WeChat user info",
            });
          }
          
          // 先查找是否存在关联的账户
          const existingAccount = await ctx.context.adapter.findOne({
            model: "account",
            where: [
              {
                field: "providerId",
                value: "wechat",
                operator: "eq"
              },
              {
                field: "accountId",
                value: profile.unionid || profile.openid,
                operator: "eq"
              }
            ]
          }) as Account;

          let user: null | User;
          
          if (existingAccount) {
            // 如果账户存在，获取关联的用户
            user = await ctx.context.adapter.findOne({
              model: "user",
              where: [
                {
                  field: "id",
                  value: existingAccount.userId,
                  operator: "eq"
                }
              ]
            });
            
            if (!user) {
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "Associated user not found",
              });
            }
          } else {
            // 创建新用户
            // Generate unique virtual email, only used during user creation
            // Subsequent logins are found via account.accountId (openid/unionid)
            // Using .internal TLD to indicate internal-use virtual email
            user = await ctx.context.internalAdapter.createUser({
              name: profile.nickname,
              email: `wechat.${nanoid(8)}@tinyship.internal`,
              emailVerified: true,
              image: profile.headimgurl,
            });

            // 创建账户关联
            await ctx.context.internalAdapter.createAccount({
              providerId: "wechat",
              accountId: profile.unionid || profile.openid,
              userId: user.id,
              scope: "snsapi_login",
              accessToken: tokenData.access_token,
              tokenType: "bearer",
            });
          }

          // 创建会话 (better-auth 1.4+ takes only userId)
          const newSession = await ctx.context.internalAdapter.createSession(
            user.id
          );

          // 设置会话 cookie
          await ctx.setSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            newSession.token,
            ctx.context.secret,
            {
              ...ctx.context.authCookies.sessionToken.options,
              path: "/",
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
            }
          );

          const redirectUrl = returnTo || options.callbackUrl || '/'
          throw ctx.redirect(redirectUrl);
        } catch (error) {
          if (error instanceof APIError) {
            throw error;
          }
          console.error("WeChat login error:", error);
          throw new APIError("INTERNAL_SERVER_ERROR", {
            message: "Failed to process WeChat login",
          });
        }
      }),
    },
  };
}; 