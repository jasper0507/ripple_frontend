import { describe, expect, it } from 'vitest'
import {
  postListTargetFromPath,
  bumpPostListGeneration,
  clearListPreserve,
  createPostListMemory,
  dedupePosts,
  isPostListAppendPaused,
  isPostListGenerationCurrent,
  markListPreserve,
  nextPostPage,
  parsePostOrder,
  pausePostListAppend,
  peekListPreserve,
  postListSourceFromLocation,
  postListViewKey,
  postListViewKeyFromQueryKey,
  takeListPreserve,
  rememberDeletedPost,
  resetPostListView,
  visiblePosts,
} from './post-list'

const post = (id: number) => ({ id, title: `帖子${id}` })

describe('nextPostPage', () => {
  it('满页且总数未读完时，下一页用响应里的页码加一', () => {
    expect(
      nextPostPage({ page: 2, page_size: 10, total: 25, items: Array.from({ length: 10 }, (_, i) => i) }),
    ).toBe(3)
  })

  it('索引中的删除造成短页或空页时继续，读到 total 时结束', () => {
    expect(nextPostPage({ page: 1, page_size: 10, total: 25, items: [1, 2] })).toBe(2)
    expect(nextPostPage({ page: 1, page_size: 10, total: 25, items: [] })).toBe(2)
    expect(nextPostPage({ page: 3, page_size: 10, total: 25, items: [] })).toBeUndefined()
    expect(
      nextPostPage({ page: 3, page_size: 10, total: 30, items: Array.from({ length: 10 }, (_, i) => i) }),
    ).toBeUndefined()
  })

  it('总数为零或分页元数据不安全时停止', () => {
    expect(nextPostPage({ page: 1, page_size: 10, total: 0, items: [] })).toBeUndefined()
    for (const invalid of [
      { page: 0, page_size: 10, total: 11, items: [] },
      { page: 1.5, page_size: 10, total: 11, items: [] },
      { page: 1, page_size: 20, total: 21, items: [] },
      { page: 1, page_size: 10, total: -1, items: [] },
      { page: 1, page_size: 10, total: Number.MAX_SAFE_INTEGER + 1, items: [] },
    ]) expect(nextPostPage(invalid)).toBeUndefined()
  })

  it('不用去重后的条数推算下一页', () => {
    const raw = Array.from({ length: 10 }, (_, i) => i)
    expect(nextPostPage({ page: 1, page_size: 10, total: 11, items: raw })).toBe(2)
  })
})

describe('dedupePosts', () => {
  it('按 ID 保留先出现的顺序', () => {
    expect(dedupePosts([[post(1), post(2)], [post(2), post(3)]])).toEqual([
      post(1),
      post(2),
      post(3),
    ])
  })
})

describe('列表代次、暂停与已删帖子', () => {
  it('重置后旧代次失效，并恢复追加', () => {
    const memory = createPostListMemory()
    const viewKey = postListViewKey(null, 'time')
    pausePostListAppend(memory, viewKey)
    const stale = bumpPostListGeneration(memory, viewKey)
    const current = resetPostListView(memory, viewKey)

    expect(isPostListGenerationCurrent(memory, viewKey, stale)).toBe(false)
    expect(isPostListGenerationCurrent(memory, viewKey, current)).toBe(true)
    expect(isPostListAppendPaused(memory, viewKey)).toBe(false)
  })

  it('已删除的帖子不会回到合并结果里', () => {
    const memory = createPostListMemory()
    rememberDeletedPost(memory, 2)
    expect(visiblePosts([[post(1), post(2)], [post(2), post(3)]], memory.deletedIds)).toEqual([
      post(1),
      post(3),
    ])
  })

  it('只恢复对应视图记下的滚动位置', () => {
    const memory = createPostListMemory()
    const time = postListViewKey(null, 'time')
    const hot = postListViewKey(null, 'hot')
    const token = markListPreserve(memory, time, 480)

    expect(peekListPreserve(memory, time)).toBe(480)
    expect(peekListPreserve(memory, hot)).toBeNull()
    clearListPreserve(memory, token)
    expect(peekListPreserve(memory, time)).toBeNull()
  })

  it('打开同一份列表取出滚动位置，打开另一份则丢掉', () => {
    const memory = createPostListMemory()
    const time = postListViewKey(null, 'time')
    markListPreserve(memory, time, 480)

    expect(takeListPreserve(memory, postListViewKey(1, 'time'))).toBeNull()
    expect(peekListPreserve(memory, time)).toBeNull()

    markListPreserve(memory, time, 320)
    expect(takeListPreserve(memory, time)).toBe(320)
    expect(takeListPreserve(memory, time)).toBeNull()
  })
})

describe('postListSourceFromLocation', () => {
  it('列表用当前地址，详情沿用带来的列表，其余不带', () => {
    expect(postListSourceFromLocation('/', null)).toBe('/')
    expect(postListSourceFromLocation('/communities/2?order=hot', '/')).toBe(
      '/communities/2?order=hot',
    )
    expect(postListSourceFromLocation('/posts/7', '/communities/2?order=hot')).toBe(
      '/communities/2?order=hot',
    )
    expect(postListSourceFromLocation('/posts/7', '/posts/3')).toBeNull()
    expect(postListSourceFromLocation('/posts/new', null)).toBeNull()
  })
})

describe('postListTargetFromPath', () => {
  it('从首页和社区页路径还原筛选', () => {
    expect(postListTargetFromPath('/')).toEqual({ communityId: null, order: 'time' })
    expect(postListTargetFromPath('/?order=hot')).toEqual({ communityId: null, order: 'hot' })
    expect(postListTargetFromPath('/communities/12?order=time')).toEqual({
      communityId: 12,
      order: 'time',
    })
    expect(postListTargetFromPath('/posts/4')).toBeNull()
    expect(postListTargetFromPath('/communities/0')).toBeNull()
  })
})

describe('postListViewKeyFromQueryKey', () => {
  it('只从帖子列表查询键还原同一套视图', () => {
    expect(postListViewKeyFromQueryKey(['posts', 'list', null, 'time'])).toBe(
      postListViewKey(null, 'time'),
    )
    expect(postListViewKeyFromQueryKey(['posts', 'list', 4, 'hot'])).toBe(postListViewKey(4, 'hot'))
    expect(postListViewKeyFromQueryKey(['posts', 'detail', 4])).toBeNull()
    expect(postListViewKeyFromQueryKey(['posts', 'list', '4', 'time'])).toBeNull()
  })
})

describe('parsePostOrder', () => {
  it('只接受 hot，其余都是 time', () => {
    expect(parsePostOrder('hot')).toBe('hot')
    expect(parsePostOrder('time')).toBe('time')
    expect(parsePostOrder(null)).toBe('time')
    expect(parsePostOrder('views')).toBe('time')
  })
})
