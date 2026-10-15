import { describe, expect, it } from 'vitest'
import {
  commentPageWrite,
  commentTailPlan,
  createCommentListMemory,
  dedupeComments,
  isCommentListAppendPaused,
  isCommentListCaughtUp,
  isCommentListGenerationCurrent,
  nextCommentPage,
  pendingEchoes,
  rememberDeletedComment,
  replyQuote,
  resetCommentList,
  visibleComments,
} from './comment-list'

const comment = (id: number, replyTo: number | null = null) => ({
  id,
  content: `评论${id}`,
  author_username: id % 2 === 0 ? 'alice' : 'bob',
  reply_to_comment_id: replyTo,
})

const full = (page: number, total: number, start: number) => ({
  page,
  page_size: 10,
  total,
  items: Array.from({ length: 10 }, (_, index) => start + index),
})

describe('nextCommentPage', () => {
  it('满页且总数未读完时，下一页用响应里的页码加一', () => {
    expect(nextCommentPage(full(2, 25, 11))).toBe(3)
  })

  it('原始条目不足一页、空页或已到总数时结束', () => {
    expect(nextCommentPage({ page: 1, page_size: 10, total: 25, items: [1, 2] })).toBeUndefined()
    expect(nextCommentPage({ page: 3, page_size: 10, total: 25, items: [] })).toBeUndefined()
    expect(nextCommentPage(full(3, 30, 21))).toBeUndefined()
  })

  it('不用去重后的条数推算下一页', () => {
    expect(nextCommentPage(full(1, 11, 1))).toBe(2)
  })
})

describe('评论去重、引用与回显', () => {
  it('按 ID 保留先出现的顺序，已删除的评论不回到列表，回复还在', () => {
    const pages = [
      [comment(1), comment(2, 1)],
      [comment(2, 1), comment(3, 1)],
    ]
    expect(dedupeComments(pages).map((item) => item.id)).toEqual([1, 2, 3])
    expect(visibleComments(pages, new Set([1])).map((item) => item.id)).toEqual([2, 3])
  })

  it('目标已加载时引用正文，没加载只留编号，确认删除才标已删除', () => {
    const loaded = new Map([[2, comment(2)]])
    expect(replyQuote(1, loaded, new Set())).toEqual({ kind: 'number', id: 1 })
    expect(replyQuote(2, loaded, new Set())).toEqual({
      kind: 'quote',
      id: 2,
      authorName: 'alice',
      content: '评论2',
    })
    expect(replyQuote(2, loaded, new Set([2]))).toEqual({ kind: 'deleted', id: 2 })
    expect(replyQuote(null, loaded, new Set())).toEqual({ kind: 'none' })
  })

  it('时间线或已删除集合里已经有的回显不再单独显示', () => {
    const echoes = [
      { id: 4, content: '刚发出' },
      { id: 5, content: '还在后面' },
      { id: 6, content: '已经删了' },
    ]
    expect(pendingEchoes(echoes, new Set([4]), new Set([6])).map((item) => item.id)).toEqual([5])
  })
})

describe('是否已经读到底，以及尾页怎么接', () => {
  it('只有从第 1 页连续读到没有下一页，才算读到底', () => {
    expect(isCommentListCaughtUp([])).toBe(false)
    expect(isCommentListCaughtUp([full(1, 25, 1)])).toBe(false)
    expect(
      isCommentListCaughtUp([{ page: 1, page_size: 10, total: 3, items: [1, 2, 3] }]),
    ).toBe(true)
    expect(isCommentListCaughtUp([full(1, 20, 1), full(2, 20, 11)])).toBe(true)
    expect(isCommentListCaughtUp([full(2, 20, 11)])).toBe(false)
  })

  it('没读到底时保持原列表；读到底时只核对当前末页', () => {
    expect(commentTailPlan([full(1, 25, 1)])).toEqual({ kind: 'hold' })
    expect(commentTailPlan([full(1, 20, 1), full(2, 20, 11)])).toEqual({
      kind: 'check-last',
      page: 2,
    })
  })

  it('只能替换当前末页或追加紧邻的下一页，不能把后面的页拼到缺口上', () => {
    const loaded = [{ page: 1 }]
    expect(commentPageWrite(loaded, { page: 1 })).toBe('replace-last')
    expect(commentPageWrite(loaded, { page: 2 })).toBe('append')
    expect(commentPageWrite(loaded, { page: 3 })).toBe('reject')
    expect(commentPageWrite([], { page: 1 })).toBe('append')
    expect(commentPageWrite([], { page: 2 })).toBe('reject')
  })
})

describe('评论列表代次', () => {
  it('从第一批刷新后旧代次失效，并恢复追加', () => {
    const memory = createCommentListMemory()
    rememberDeletedComment(memory, 4)
    const current = resetCommentList(memory, 7)

    expect(isCommentListAppendPaused(memory, 7)).toBe(false)
    expect(isCommentListGenerationCurrent(memory, 7, 0)).toBe(false)
    expect(isCommentListGenerationCurrent(memory, 7, current)).toBe(true)
    expect(memory.deletedIds.has(4)).toBe(true)
  })
})
