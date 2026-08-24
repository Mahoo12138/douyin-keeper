// Typed client for the Douyin Keeper Go API (generated from packages/contracts).
// All data flows through the Go backend (docs/04 §2.3) — the SDK never talks
// to a Node server.
import createClient from 'openapi-fetch'
import type { components, paths } from './schema.js'

export type { paths, components } from './schema.js'

/** apiClient points at the Go backend under the same origin (/api/v1). */
export const api = createClient<paths>({ baseUrl: '/api/v1' })

/** Typed helper for the frozen MVP auth call (docs/11 §16). */
export async function login(username: string, password: string) {
  const { data, error } = await api.POST('/auth/login', {
    body: { username, password },
  })
  if (error) throw new ApiError(error.error?.code ?? 'UNKNOWN', error.error?.message ?? 'login failed')
  return data
}

export async function register(username: string, password: string) {
  const { data, error } = await api.POST('/auth/register', {
    body: { username, password },
  })
  if (error) throw new ApiError(error.error?.code ?? 'UNKNOWN', error.error?.message ?? 'register failed')
  return data
}

export async function me(accessToken: string) {
  const { data } = await api.GET('/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!data) throw new ApiError('UNAUTHENTICATED', 'me failed')
  return data
}

export async function listAdminUsers(accessToken: string, options?: { limit?: number }) {
  const { data, error } = await api.GET('/admin/users', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'admin users lookup failed')
  return data
}

export async function listAdminAccounts(accessToken: string, options?: { limit?: number }) {
  const { data, error } = await api.GET('/admin/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'admin accounts lookup failed')
  return data
}

export async function pauseAdminAccount(accessToken: string, accountId: string) {
  const { data, error } = await api.POST('/admin/accounts/{accountId}/pause', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'admin account pause failed')
  return data
}

export async function resumeAdminAccount(accessToken: string, accountId: string) {
  const { data, error } = await api.POST('/admin/accounts/{accountId}/resume', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'admin account resume failed')
  return data
}

export async function listAdminEntitlementPlans(accessToken: string) {
  const { data, error } = await api.GET('/admin/entitlement-plans', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throwApiError(error, 'admin entitlement plans lookup failed')
  return data
}

export async function createAdminEntitlementPlan(accessToken: string, body: components['schemas']['AdminCreateEntitlementPlanRequest']) {
  const { data, error } = await api.POST('/admin/entitlement-plans', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  })
  if (error) throwApiError(error, 'admin entitlement plan creation failed')
  return data
}

export async function disableAdminEntitlementPlan(accessToken: string, planId: string) {
  const { error } = await api.POST('/admin/entitlement-plans/{planId}/disable', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { planId } },
  })
  if (error) throwApiError(error, 'admin entitlement plan disable failed')
}

export async function listAdminCardBatches(accessToken: string, options?: { limit?: number }) {
  const { data, error } = await api.GET('/admin/card-batches', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'admin card batches lookup failed')
  return data
}

export async function createAdminCardBatch(accessToken: string, body: components['schemas']['AdminCreateCardBatchRequest']) {
  const { data, error } = await api.POST('/admin/card-batches', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  })
  if (error) throwApiError(error, 'admin card batch creation failed')
  return data
}

export async function getAdminCardBatch(accessToken: string, batchId: string) {
  const { data, error } = await api.GET('/admin/card-batches/{batchId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { batchId } },
  })
  if (error) throwApiError(error, 'admin card batch lookup failed')
  return data
}

export async function disableAdminCardBatch(accessToken: string, batchId: string) {
  const { error } = await api.POST('/admin/card-batches/{batchId}/disable', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { batchId } },
  })
  if (error) throwApiError(error, 'admin card batch disable failed')
}

export async function listAdminRedemptions(accessToken: string, options?: { limit?: number }) {
  const { data, error } = await api.GET('/admin/redemptions', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'admin redemptions lookup failed')
  return data
}

export async function getAdminUserEntitlements(accessToken: string, userId: string, options?: { limit?: number }) {
  const { data, error } = await api.GET('/admin/users/{userId}/entitlements', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { userId }, query: options },
  })
  if (error) throwApiError(error, 'admin user entitlements lookup failed')
  return data
}

export async function createAdminUserEntitlementGrant(accessToken: string, userId: string, body: components['schemas']['AdminCreateEntitlementGrantRequest']) {
  const { data, error } = await api.POST('/admin/users/{userId}/entitlement-grants', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { userId } },
    body,
  })
  if (error) throwApiError(error, 'admin entitlement grant creation failed')
  return data
}

export async function revokeAdminEntitlementGrant(accessToken: string, grantId: string, body: components['schemas']['AdminRevokeEntitlementRequest']) {
  const { error } = await api.POST('/admin/entitlement-grants/{grantId}/revoke', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { grantId } },
    body,
  })
  if (error) throwApiError(error, 'admin entitlement grant revoke failed')
}

export async function listAdminCardCodes(accessToken: string, batchId: string, options?: { limit?: number }) {
  const { data, error } = await api.GET('/admin/card-batches/{batchId}/codes', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { batchId }, query: options },
  })
  if (error) throwApiError(error, 'admin card codes lookup failed')
  return data
}

export async function revokeAdminCardCode(accessToken: string, batchId: string, codeId: number, body: components['schemas']['AdminRevokeEntitlementRequest']) {
  const { error } = await api.POST('/admin/card-batches/{batchId}/codes/{codeId}/revoke', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { batchId, codeId } },
    body,
  })
  if (error) throwApiError(error, 'admin card code revoke failed')
}

export async function getAdminRuntime(accessToken: string) {
  const { data, error } = await api.GET('/admin/workers', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throwApiError(error, 'admin runtime lookup failed')
  return data
}

export async function getAdminOverview(accessToken: string) {
  const { data, error } = await api.GET('/admin/overview', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throwApiError(error, 'admin overview lookup failed')
  return data
}

export async function listAdminAdapters(accessToken: string) {
  const { data, error } = await api.GET('/admin/adapters', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throwApiError(error, 'admin adapters lookup failed')
  return data
}

export async function updateAdminAdapter(accessToken: string, adapter: string, enabled: boolean) {
  const { data, error } = await api.PATCH('/admin/adapters/{adapter}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { adapter } },
    body: { enabled },
  })
  if (error) throwApiError(error, 'admin adapter update failed')
  return data
}

export async function listAdminRisks(accessToken: string, options?: { category?: components['schemas']['AdminRisk']['category']; severity?: components['schemas']['AdminRisk']['severity']; code?: string; limit?: number }) {
  const { data, error } = await api.GET('/admin/risks', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'admin risks lookup failed')
  return data
}

export async function listAdminAuditLogs(accessToken: string, options?: { action?: string; resource_type?: string; actor?: string; limit?: number }) {
  const { data, error } = await api.GET('/admin/audit-logs', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'admin audit logs lookup failed')
  return data
}

export async function redeemCardCode(accessToken: string, code: string) {
  const { data, error } = await api.POST('/entitlements/redeem', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { code },
  })
  if (error) throw new ApiError(error.error?.code ?? 'UNKNOWN', error.error?.message ?? 'redeem failed')
  return data
}

export async function myEntitlement(accessToken: string) {
  const { data } = await api.GET('/me/entitlement', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!data) throw new ApiError('NOT_FOUND', 'entitlement failed')
  return data
}

export async function listAccounts(accessToken: string) {
  const { data } = await api.GET('/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!data) throw new ApiError('NOT_FOUND', 'accounts failed')
  return data
}

export async function createAccountBinding(accessToken: string, method: 'qr' | 'sms' = 'qr', phone?: string) {
  const { data, error } = await api.POST('/accounts/bindings', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { method, ...(phone ? { phone } : {}) },
  })
  if (error) throwApiError(error, 'binding failed')
  return data
}

export async function checkAccountSession(accessToken: string, accountId: string) {
  const { data, error } = await api.POST('/accounts/{accountId}/session-check', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'session check failed')
  return data
}

export async function syncAccountFriends(accessToken: string, accountId: string) {
  const { data, error } = await api.POST('/accounts/{accountId}/friends-sync', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'friend sync failed')
  return data
}

export async function accountCapabilities(accessToken: string, accountId: string) {
  const { data, error } = await api.GET('/accounts/{accountId}/capabilities', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId } },
  })
  if (error) throwApiError(error, 'capabilities failed')
  return data
}

export async function listNotifications(accessToken: string, options?: { unread_only?: boolean; limit?: number }) {
  const { data, error } = await api.GET('/notifications', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'notifications lookup failed')
  return data
}

export async function markNotificationRead(accessToken: string, notificationId: string) {
  const { error } = await api.POST('/notifications/{notificationId}/read', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { notificationId } },
  })
  if (error) throwApiError(error, 'notification read failed')
}

export async function markAllNotificationsRead(accessToken: string) {
  const { data, error } = await api.POST('/notifications/read-all', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throwApiError(error, 'notifications read-all failed')
  return data
}

export async function listFriends(accessToken: string, accountId: string, options?: { limit?: number; cursor?: string }) {
  const { data, error } = await api.GET('/accounts/{accountId}/friends', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId }, query: options },
  })
  if (error) throwApiError(error, 'friends failed')
  return data
}

export async function listConversations(accessToken: string, accountId: string, options?: { limit?: number }) {
  const { data, error } = await api.GET('/accounts/{accountId}/conversations', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { accountId }, query: options },
  })
  if (error) throwApiError(error, 'conversations failed')
  return data
}

export type MessageTemplateInput = {
  name: string
  kind: 'text' | 'sticker'
  body: string
}

export type MessageTemplatePatch = Partial<MessageTemplateInput>

export async function listMessageTemplates(accessToken: string, options?: { kind?: MessageTemplateInput['kind'] }) {
  const { data, error } = await api.GET('/message-templates', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'message templates lookup failed')
  return data
}

export async function createMessageTemplate(accessToken: string, body: MessageTemplateInput) {
  const { data, error } = await api.POST('/message-templates', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  })
  if (error) throwApiError(error, 'message template creation failed')
  return data
}

export async function updateMessageTemplate(accessToken: string, templateId: string, body: MessageTemplatePatch) {
  const { data, error } = await api.PATCH('/message-templates/{templateId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { templateId } },
    body,
  })
  if (error) throwApiError(error, 'message template update failed')
  return data
}

export async function deleteMessageTemplate(accessToken: string, templateId: string) {
  const { error } = await api.DELETE('/message-templates/{templateId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { templateId } },
  })
  if (error) throwApiError(error, 'message template deletion failed')
}

export async function updateFriend(accessToken: string, friendId: string, sparkEnabled: boolean) {
  const { data, error } = await api.PATCH('/friends/{friendId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { friendId } },
    body: { spark_enabled: sparkEnabled },
  })
  if (error) throwApiError(error, 'friend update failed')
  return data
}

export async function listTasks(accessToken: string) {
  const { data, error } = await api.GET('/tasks', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (error) throwApiError(error, 'tasks failed')
  return data
}

export type CreateTaskInput = components['schemas']['CreateTaskRequest']
export type UpdateTaskInput = {
  enabled?: boolean
  timezone?: string
  window_start?: string
  window_end?: string
  message?: { kind: 'text' | 'sticker'; body: string }
  allow_first_message?: boolean
}

export async function createTask(accessToken: string, body: CreateTaskInput) {
  const { data, error } = await api.POST('/tasks', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  })
  if (error) throwApiError(error, 'task creation failed')
  return data
}

export async function updateTask(accessToken: string, taskId: string, body: UpdateTaskInput) {
  const { data, error } = await api.PATCH('/tasks/{taskId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { taskId } },
    body,
  })
  if (error) throwApiError(error, 'task update failed')
  return data
}

export async function deleteTask(accessToken: string, taskId: string) {
  const { error } = await api.DELETE('/tasks/{taskId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { taskId } },
  })
  if (error) throwApiError(error, 'task deletion failed')
}

export async function runTaskNow(accessToken: string, taskId: string, idempotencyKey = crypto.randomUUID()) {
  const { data, error } = await api.POST('/tasks/{taskId}/run-now', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Idempotency-Key': idempotencyKey },
    params: { path: { taskId }, header: { 'Idempotency-Key': idempotencyKey } },
  })
  if (error) throwApiError(error, 'task run failed')
  return data
}

export type SendIntentListOptions = {
  account_id?: string
  friend_id?: string
  status?: components['schemas']['SendIntent']['status']
  from?: string
  to?: string
}

export async function listSendIntents(accessToken: string, options?: SendIntentListOptions) {
  const { data, error } = await api.GET('/send-intents', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { query: options },
  })
  if (error) throwApiError(error, 'send history failed')
  return data
}

export async function getSendJob(accessToken: string, jobId: string) {
  const { data, error } = await api.GET('/send-jobs/{jobId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { jobId } },
  })
  if (error) throwApiError(error, 'send job lookup failed')
  return data
}

export async function getJob(accessToken: string, jobId: string) {
  const { data, error } = await api.GET('/jobs/{jobId}', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { jobId } },
  })
  if (error) throwApiError(error, 'job lookup failed')
  return data
}

export async function cancelJob(accessToken: string, jobId: string) {
  const { data, error } = await api.POST('/jobs/{jobId}/cancel', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { jobId } },
  })
  if (error) throwApiError(error, 'job cancellation failed')
  return data
}

export async function submitSMSVerification(accessToken: string, jobId: string, code: string) {
  const { data, error } = await api.POST('/jobs/{jobId}/sms-verify', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { path: { jobId } },
    body: { code },
  })
  if (error) throwApiError(error, 'SMS verification failed')
  return data
}

export type JobEventEnvelope = {
  seq: number
  event_type: string
  payload: Record<string, unknown>
}

function throwApiError(error: unknown, fallback: string): never {
  const body = error as { error?: { code?: string; message?: string } } | undefined
  throw new ApiError(body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? fallback)
}

/** Streams the replay-first SSE endpoint; callers own AbortController lifetime. */
export async function streamJobEvents(
  accessToken: string,
  jobId: string,
  onEvent: (event: JobEventEnvelope) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/events`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' },
    signal,
  })
  if (!response.ok) throw new ApiError(`HTTP_${response.status}`, 'job event stream failed')
  if (!response.body) throw new ApiError('STREAM_UNAVAILABLE', 'job event stream is unavailable')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
      const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const lines = frame.split('\n')
      const eventType = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message'
      const seqValue = lines.find((line) => line.startsWith('id:'))?.slice(3).trim() ?? '0'
      const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
      if (!data) continue
      onEvent({ seq: Number(seqValue) || 0, event_type: eventType, payload: JSON.parse(data) as Record<string, unknown> })
    }
  }
}

/** Error carrying the stable backend error code (docs/11 §13). */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
