import { describe, expect, it } from 'vitest'
import { clearDraftsForUser } from './auth-storage'
import {
  clearCommentDraft,
  commentCreateFailure,
  commentDraftStorageKey,
  commentSubmitOutcome,
  readCommentDraft,
  validateCommentDraft,
  writeCommentDraft,
  type CommentDraft,
} from './comment-draft'

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key)
    },
    setItem: (key, value) => {
      items.set(key, value)
    },
  }
}

const draft: CommentDraft = {
  content: '先留着',
  replyToCommentId: 12,
  replyTargetRejected: false,
}

describe('评论草稿', () => {
  it('按用户 UUID 和帖子 ID 隔离', () => {
    const storage = memoryStorage()
    writeCommentDraft(storage, 'user-a', 7, draft)
    writeCommentDraft(storage, 'user-a', 8, { ...draft, content: '另一篇' })
    writeCommentDraft(storage, 'user-b', 7, { ...draft, content: '别人的' })

    expect(readCommentDraft(storage, 'user-a', 7)).toEqual(draft)
    expect(readCommentDraft(storage, 'user-a', 8)?.content).toBe('另一篇')
    expect(readCommentDraft(storage, 'user-b', 7)?.content).toBe('别人的')
    expect(readCommentDraft(storage, 'user-c', 7)).toBeNull()
    expect(commentDraftStorageKey('user-a', 7)).toBe('ripple:draft:user-a:comment:7')
  })

  it('损坏的草稿视为没有', () => {
    const storage = memoryStorage()
    storage.setItem(commentDraftStorageKey('user-a', 7), '{')
    storage.setItem(commentDraftStorageKey('user-a', 8), JSON.stringify({ content: '缺目标' }))
    expect(readCommentDraft(storage, 'user-a', 7)).toBeNull()
    expect(readCommentDraft(storage, 'user-a', 8)).toBeNull()
  })

  it('主动退出清掉该账号全部评论草稿，放弃只清当前帖子', () => {
    const storage = memoryStorage()
    writeCommentDraft(storage, 'user-a', 7, draft)
    writeCommentDraft(storage, 'user-a', 8, draft)
    writeCommentDraft(storage, 'user-b', 7, draft)

    clearCommentDraft(storage, 'user-a', 7)
    expect(readCommentDraft(storage, 'user-a', 7)).toBeNull()
    expect(readCommentDraft(storage, 'user-a', 8)).toEqual(draft)

    clearDraftsForUser(storage, 'user-a')
    expect(readCommentDraft(storage, 'user-a', 8)).toBeNull()
    expect(readCommentDraft(storage, 'user-b', 7)).toEqual(draft)
  })
})

describe('validateCommentDraft', () => {
  it('评论按 Unicode 字符校验边界，超限不丢草稿', () => {
    const storage = memoryStorage()
    const valid = { ...draft, content: '  ' + '😀'.repeat(2000) + '  ' }
    expect(validateCommentDraft(valid)).toBeNull()
    const tooLong = { ...draft, content: '😀'.repeat(2001) }
    expect(validateCommentDraft(tooLong)).toBe('评论不超过 2,000 个字符')
    writeCommentDraft(storage, 'user-a', 7, tooLong)
    expect(readCommentDraft(storage, 'user-a', 7)).toEqual(tooLong)
  })

  it('正文去掉空白后必须有内容，回复目标可以没有', () => {
    expect(validateCommentDraft({ content: '  说一句  ', replyToCommentId: null, replyTargetRejected: false })).toBeNull()
    expect(validateCommentDraft({ ...draft, content: '   ' })).toBe('请填写评论')
    expect(validateCommentDraft({ ...draft, replyTargetRejected: true })).toBe(
      '这个回复目标已经不能使用。请重新选择，或改为直接评论。',
    )
  })
})

describe('commentSubmitOutcome', () => {
  const snapshot = { userUuid: 'user-a', sessionId: 'session-1', postId: 7, draft }

  it('账号、会话和草稿都还对得上时才清草稿', () => {
    const storage = memoryStorage()
    writeCommentDraft(storage, 'user-a', 7, draft)
    expect(commentSubmitOutcome(storage, snapshot, { userUuid: 'user-a', sessionId: 'session-1' })).toBe(
      'commit',
    )
  })

  it('提交后改过的草稿保留下来，仍可记录这次已发布的回显', () => {
    const storage = memoryStorage()
    writeCommentDraft(storage, 'user-a', 7, { ...draft, content: '后来又写了' })
    expect(commentSubmitOutcome(storage, snapshot, { userUuid: 'user-a', sessionId: 'session-1' })).toBe(
      'echo-only',
    )
    expect(readCommentDraft(storage, 'user-a', 7)?.content).toBe('后来又写了')
  })

  it('换了会话、换了账号或已经退出时，不处理这次回调', () => {
    const storage = memoryStorage()
    writeCommentDraft(storage, 'user-a', 7, draft)
    expect(commentSubmitOutcome(storage, snapshot, { userUuid: 'user-a', sessionId: 'session-2' })).toBe(
      'ignore',
    )
    expect(commentSubmitOutcome(storage, snapshot, { userUuid: 'user-b', sessionId: 'session-1' })).toBe(
      'ignore',
    )
    expect(commentSubmitOutcome(storage, snapshot, null)).toBe('ignore')
    expect(readCommentDraft(storage, 'user-a', 7)).toEqual(draft)
  })
})

describe('commentCreateFailure', () => {
  it('带了回复目标且业务码是 INVALID_PARAMS 时，目标不能用，但不把它当成已删除', () => {
    expect(commentCreateFailure({ kind: 'params', code: 'INVALID_PARAMS' }, true)).toBe('target-rejected')
  })

  it('没带回复目标，或业务码不是无效回复目标时，参数错误仍是参数错误', () => {
    expect(commentCreateFailure({ kind: 'params', code: 'INVALID_PARAMS' }, false)).toBe('params')
    expect(commentCreateFailure({ kind: 'params', code: 'SOMETHING_ELSE' }, true)).toBe('params')
    expect(commentCreateFailure({ kind: 'params' }, true)).toBe('params')
  })

  it('网络或服务器错误是结果未确认，帖子不存在单独区分', () => {
    expect(commentCreateFailure({ kind: 'network' }, true)).toBe('unconfirmed')
    expect(commentCreateFailure({ kind: 'server' }, false)).toBe('unconfirmed')
    expect(commentCreateFailure({ kind: 'not-found', code: 'POST_NOT_FOUND' }, true)).toBe('post-missing')
    expect(commentCreateFailure({ kind: 'auth' }, false)).toBe('auth')
  })

  it('429 限流单独区分，带回复目标也不标记目标失效', () => {
    expect(commentCreateFailure({ kind: 'rate-limited', code: 'TOO_MANY_REQUESTS' }, true)).toBe('rate-limited')
  })
})
