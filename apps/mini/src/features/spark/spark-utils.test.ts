import { describe, expect, it } from 'vitest'
import type { components } from '@douyin-keeper/sdk-ts'

import { enabledTaskCount, replaceFriend, replaceTask, taskCreateDraftError, taskDraftError, taskForFriend, taskTimeInput, taskTimePayload } from './spark-utils'

type Friend = components['schemas']['Friend']
type SparkTask = components['schemas']['SparkTask']

function makeFriend(id: string, sparkEnabled: boolean): Friend {
  return {
    id,
    platform_identity_status: 'resolved',
    display_name: id,
    nickname: id,
    short_id: null,
    avatar_url: null,
    streak_days: 3,
    has_conversation: true,
    spark_enabled: sparkEnabled,
    last_sent_at: null,
  }
}

function makeTask(id: string, friendId: string, enabled: boolean): SparkTask {
  return {
    id,
    account_id: 'account-1',
    friend_id: friendId,
    enabled,
    timezone: 'Asia/Shanghai',
    window_start: '19:30:00',
    window_end: '22:30:00',
    message: { kind: 'text', body: '晚间问候' },
    allow_first_message: false,
  }
}

describe('spark view helpers', () => {
  it('finds the task belonging to a friend', () => {
    const task = makeTask('task-1', 'friend-1', true)

    expect(taskForFriend([task], 'friend-1')).toEqual(task)
    expect(taskForFriend([task], 'friend-2')).toBeUndefined()
  })

  it('replaces only the server-confirmed friend state', () => {
    const friends = [makeFriend('friend-1', false), makeFriend('friend-2', true)]
    const updated = makeFriend('friend-1', true)

    expect(replaceFriend(friends, updated)).toEqual([updated, friends[1]])
  })

  it('preserves conversation metadata when the legacy friend endpoint responds', () => {
    const friends = [{ ...makeFriend('group-target', false), conversation_type: 'group' as const, spark_supported: true, channel: 'consumer' as const }]
    const updated = makeFriend('group-target', true)

    expect(replaceFriend(friends, updated)[0]).toMatchObject({
      spark_enabled: true,
      conversation_type: 'group',
      spark_supported: true,
      channel: 'consumer',
    })
  })

  it('replaces task state and counts enabled tasks', () => {
    const tasks = [makeTask('task-1', 'friend-1', true), makeTask('task-2', 'friend-2', false)]

    expect(enabledTaskCount(tasks)).toBe(1)
    expect(enabledTaskCount(replaceTask(tasks, makeTask('task-2', 'friend-2', true)))).toBe(2)
  })

  it('normalizes task editor times and rejects invalid drafts', () => {
    expect(taskTimeInput('19:30:00')).toBe('19:30')
    expect(taskTimePayload('22:30')).toBe('22:30:00')
    expect(taskTimePayload('22:30:00')).toBe('22:30:00')
    expect(taskDraftError('', '22:30', '问候')).toContain('完整')
    expect(taskDraftError('22:30', '19:30', '问候')).toContain('晚于')
    expect(taskDraftError('19:30', '22:30', '   ')).toContain('消息')
    expect(taskDraftError('19:30', '22:30', '问候')).toBeNull()
    expect(taskCreateDraftError('', 'friend-1', '19:30', '22:30', '问候')).toContain('账号')
    expect(taskCreateDraftError('account-1', '', '19:30', '22:30', '问候')).toContain('会话')
    expect(taskCreateDraftError('account-1', 'friend-1', '19:30', '22:30', '问候')).toBeNull()
  })
})
