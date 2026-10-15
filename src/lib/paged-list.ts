// 帖子和评论共用的页码规则：固定每页 10 条，结束看原始响应，按 ID 去掉重复。
// 两边的查询键、暂停和回显仍各管各的。

export interface NumberedPage {
  page: number
  page_size: number
  total: number
  items: readonly unknown[]
}

/** 下一页取自原始响应的页码。结束只看每页条数、总数和原始条目数。 */
export function nextNumberedPage(page: NumberedPage): number | undefined {
  if (!Number.isInteger(page.page) || page.page < 1) return undefined
  if (page.page_size !== 10) return undefined
  if (!Number.isInteger(page.total) || page.total < 0) return undefined
  if (page.items.length === 0 || page.items.length < page.page_size) return undefined
  if (page.page * page.page_size >= page.total) return undefined
  return page.page + 1
}

export function dedupeById<T extends { id: number }>(pages: readonly (readonly T[])[]): T[] {
  const seen = new Set<number>()
  const result: T[] = []
  for (const items of pages) {
    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      result.push(item)
    }
  }
  return result
}

export function visibleById<T extends { id: number }>(
  pages: readonly (readonly T[])[],
  deletedIds: ReadonlySet<number>,
): T[] {
  return dedupeById(pages).filter((item) => !deletedIds.has(item.id))
}
