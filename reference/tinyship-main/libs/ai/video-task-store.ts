import { nanoid } from 'nanoid';
import type { VideoGenerationResult } from './types';

type LocalVideoTaskStatus = 'processing' | 'succeeded' | 'failed';
type AsyncVideoProviderName = 'volcengine' | 'aliyun';

export interface VideoTaskRecord {
  id: string;
  userId: string;
  provider: AsyncVideoProviderName;
  model: string;
  providerTaskId: string;
  creditCost: number;
  consumeTransactionId?: string;
  status: LocalVideoTaskStatus;
  result?: VideoGenerationResult;
  errorMessage?: string;
  refunded: boolean;
  createdAt: number;
  updatedAt: number;
}

const TASK_TTL_MS = 24 * 60 * 60 * 1000;
const videoTaskStore = new Map<string, VideoTaskRecord>();
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
let lastCleanupAt = 0;

function isExpired(task: VideoTaskRecord): boolean {
  return Date.now() - task.updatedAt > TASK_TTL_MS;
}

function cleanupExpiredTasksIfNeeded(): void {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [taskId, task] of videoTaskStore.entries()) {
    if (isExpired(task)) {
      videoTaskStore.delete(taskId);
    }
  }

  lastCleanupAt = now;
}

export function createVideoTaskRecord(input: Omit<VideoTaskRecord, 'id' | 'status' | 'refunded' | 'createdAt' | 'updatedAt'>): VideoTaskRecord {
  cleanupExpiredTasksIfNeeded();
  const now = Date.now();
  const task: VideoTaskRecord = {
    ...input,
    id: nanoid(),
    status: 'processing',
    refunded: false,
    createdAt: now,
    updatedAt: now,
  };
  videoTaskStore.set(task.id, task);
  return task;
}

export function getVideoTaskRecord(taskId: string): VideoTaskRecord | undefined {
  cleanupExpiredTasksIfNeeded();
  const task = videoTaskStore.get(taskId);
  if (!task) {
    return undefined;
  }
  if (isExpired(task)) {
    videoTaskStore.delete(taskId);
    return undefined;
  }
  return task;
}

export function markVideoTaskSucceeded(taskId: string, result: VideoGenerationResult): VideoTaskRecord | undefined {
  const task = videoTaskStore.get(taskId);
  if (!task) {
    return undefined;
  }
  task.status = 'succeeded';
  task.result = result;
  task.errorMessage = undefined;
  task.updatedAt = Date.now();
  return task;
}

export function markVideoTaskFailed(taskId: string, errorMessage: string): VideoTaskRecord | undefined {
  const task = videoTaskStore.get(taskId);
  if (!task) {
    return undefined;
  }
  task.status = 'failed';
  task.errorMessage = errorMessage;
  task.updatedAt = Date.now();
  return task;
}

export function markVideoTaskRefunded(taskId: string): VideoTaskRecord | undefined {
  const task = videoTaskStore.get(taskId);
  if (!task) {
    return undefined;
  }
  task.refunded = true;
  task.updatedAt = Date.now();
  return task;
}
