import { describe, expect, it } from 'vitest'
import { clearDraftsForUser } from './auth-storage'
import {
  clearPostDraft,
  postDraftStorageKey,
  postSubmitOutcome,
  readPostDraft,
  validatePostForm,
  writePostDraft,
  type PostDraft,
} from './post-draft'

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

const draft: PostDraft = { communityId: 3, title: '标题', content: '正文' }

describe('发帖草稿', () => {
  it('按用户 UUID 读写，读不到其他账号的草稿', () => {
    const storage = memoryStorage()
    writePostDraft(storage, 'user-a', draft)
    writePostDraft(storage, 'user-b', { communityId: 1, title: '别人的', content: '不该看到' })

    expect(readPostDraft(storage, 'user-a')).toEqual(draft)
    expect(readPostDraft(storage, 'user-b')?.title).toBe('别人的')
    expect(readPostDraft(storage, 'user-c')).toBeNull()
    expect(postDraftStorageKey('user-a')).toBe('ripple:draft:user-a:post')
  })

  it('损坏的草稿视为没有', () => {
    const storage = memoryStorage()
    storage.setItem(postDraftStorageKey('user-a'), '{')
    expect(readPostDraft(storage, 'user-a')).toBeNull()
  })

  it('主动退出会清掉该账号的发帖草稿', () => {
    const storage = memoryStorage()
    writePostDraft(storage, 'user-a', draft)
    writePostDraft(storage, 'user-b', draft)
    clearDraftsForUser(storage, 'user-a')
    expect(readPostDraft(storage, 'user-a')).toBeNull()
    expect(readPostDraft(storage, 'user-b')).toEqual(draft)
  })

  it('放弃只清当前账号', () => {
    const storage = memoryStorage()
    writePostDraft(storage, 'user-a', draft)
    writePostDraft(storage, 'user-b', draft)
    clearPostDraft(storage, 'user-a')
    expect(readPostDraft(storage, 'user-a')).toBeNull()
    expect(readPostDraft(storage, 'user-b')).toEqual(draft)
  })
})

describe('validatePostForm', () => {
  it('正文按 Unicode 字符校验边界，超限不丢草稿', () => {
    const storage = memoryStorage()
    const valid = { ...draft, content: '  ' + '😀'.repeat(10000) + '  ' }
    expect(validatePostForm(valid)).toBeNull()
    const tooLong = { ...draft, content: '😀'.repeat(10001) }
    expect(validatePostForm(tooLong)?.content).toBe('正文不超过 10,000 个字符')
    writePostDraft(storage, 'user-a', tooLong)
    expect(readPostDraft(storage, 'user-a')).toEqual(tooLong)
  })

  it('标题和正文去掉空白后必须有内容，标题不超过 128 个字符', () => {
    expect(validatePostForm({ communityId: 1, title: '  标题  ', content: ' 正文 ' })).toBeNull()
    expect(validatePostForm({ communityId: 1, title: '   ', content: '正文' })?.title).toBe('请填写标题')
    expect(validatePostForm({ communityId: 1, title: '标题', content: '  ' })?.content).toBe('请填写正文')
    expect(validatePostForm({ communityId: null, title: '标题', content: '正文' })?.communityId).toBe(
      '请选择社区',
    )
    expect(
      validatePostForm({ communityId: 1, title: '题'.repeat(129), content: '正文' })?.title,
    ).toBe('标题不超过 128 个字符')
  })
})

describe('postSubmitOutcome', () => {
  const snapshot = {
    userUuid: 'user-a',
    sessionId: 'session-1',
    draft,
  }

  it('快照、账号和会话都一致时才清理并跳转', () => {
    const storage = memoryStorage()
    writePostDraft(storage, 'user-a', draft)
    expect(postSubmitOutcome(storage, snapshot, { userUuid: 'user-a', sessionId: 'session-1' })).toBe(
      'commit',
    )
  })

  it('草稿变了、会话变了或账号变了时不清理也不跳转', () => {
    const storage = memoryStorage()
    writePostDraft(storage, 'user-a', { ...draft, title: '后来写的' })
    expect(postSubmitOutcome(storage, snapshot, { userUuid: 'user-a', sessionId: 'session-1' })).toBe(
      'ignore',
    )
    expect(readPostDraft(storage, 'user-a')?.title).toBe('后来写的')

    writePostDraft(storage, 'user-a', draft)
    expect(postSubmitOutcome(storage, snapshot, { userUuid: 'user-a', sessionId: 'session-2' })).toBe(
      'ignore',
    )
    expect(readPostDraft(storage, 'user-a')).toEqual(draft)

    expect(postSubmitOutcome(storage, snapshot, { userUuid: 'user-b', sessionId: 'session-9' })).toBe(
      'ignore',
    )
    expect(postSubmitOutcome(storage, snapshot, null)).toBe('ignore')
    expect(readPostDraft(storage, 'user-a')).toEqual(draft)
  })
})
