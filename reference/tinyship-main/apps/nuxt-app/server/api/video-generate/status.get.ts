import {
  queryVideoTask,
} from '@libs/ai'
import {
  getVideoTaskRecord,
  markVideoTaskSucceeded,
  markVideoTaskFailed,
  markVideoTaskRefunded,
} from '@libs/ai/video-task-store'
import { auth } from '@libs/auth'
import { creditService } from '@libs/credits'

export default defineEventHandler(async (event) => {
  try {
    const user = event.context.user || await (async () => {
      const session = await auth.api.getSession({
        headers: new Headers(event.node.req.headers as HeadersInit)
      })
      return session?.user
    })()

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

    const query = getQuery(event)
    const taskId = typeof query.taskId === 'string' ? query.taskId : ''
    if (!taskId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        data: {
          error: 'invalid_request',
          message: 'taskId is required'
        }
      })
    }

    const task = getVideoTaskRecord(taskId)
    if (!task || task.userId !== userId) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        data: {
          error: 'not_found',
          message: 'Task not found'
        }
      })
    }

    if (task.status === 'succeeded' && task.result) {
      const balance = await creditService.getBalance(userId)
      return {
        success: true,
        data: {
          taskId,
          status: 'succeeded',
          result: task.result,
        },
        credits: {
          remaining: balance,
        }
      }
    }

    if (task.status === 'failed') {
      const balance = await creditService.getBalance(userId)
      return {
        success: true,
        data: {
          taskId,
          status: 'failed',
          error: task.errorMessage || 'Video generation failed',
        },
        credits: {
          remaining: balance,
        }
      }
    }

    const providerTask = await queryVideoTask(task.provider, task.model, task.providerTaskId)
    if (providerTask.status === 'processing') {
      return {
        success: true,
        data: {
          taskId,
          status: 'processing',
        }
      }
    }

    if (providerTask.status === 'succeeded' && providerTask.result) {
      markVideoTaskSucceeded(taskId, providerTask.result)
      const balance = await creditService.getBalance(userId)
      return {
        success: true,
        data: {
          taskId,
          status: 'succeeded',
          result: providerTask.result,
        },
        credits: {
          remaining: balance,
        }
      }
    }

    const failureMessage = providerTask.errorMessage || 'Video generation failed'
    if (!task.refunded && task.creditCost > 0) {
      try {
        await creditService.addCredits({
          userId,
          amount: task.creditCost,
          type: 'refund',
          description: 'Refund for failed video generation',
          metadata: {
            originalTransactionId: task.consumeTransactionId,
            provider: task.provider,
            model: task.model,
            error: failureMessage,
          }
        })
        markVideoTaskRefunded(taskId)
      } catch (refundError) {
        console.error('CRITICAL: Failed to refund credits after async video failure:', {
          userId,
          taskId,
          refundError,
        })
      }
    }

    markVideoTaskFailed(taskId, failureMessage)
    const balance = await creditService.getBalance(userId)
    return {
      success: true,
      data: {
        taskId,
        status: 'failed',
        error: failureMessage,
      },
      credits: {
        remaining: balance,
      }
    }
  } catch (error: any) {
    console.error('Video status API error:', error)
    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        error: 'status_query_failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    })
  }
})
