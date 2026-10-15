// 查询标识约定（Phase 4 Q8）：
// - 公共数据（社区、帖子、评论）以资源类型与筛选参数标识，不因账号变化清空。
// - 账号数据（如本人投票方向）在公共标识后附加 accountScope：用户 UUID 与
//   本次登录会话标识。续期沿用本次会话，重新登录或换账号重新隔离；
//   访问令牌不进入标识。
// 具体资源查询随所属业务模块落地。帖子列表与详情、评论列表、本人投票方向已接入。
// 评论键 ['comments', 帖子 ID] 是公开查询。投票键 ['votes', 帖子 ID, ...accountScope]。

/** 账号数据的作用域标识：拼在公共查询键之后，如 ['votes', postId, ...accountScope(s)] */
export function accountScope(identity: { userUuid: string; sessionId: string }) {
  return ['account', identity.userUuid, identity.sessionId] as const
}

/** 账号相关查询：键中同时含 account 标记与该用户 UUID。公共社区查询不含这两项。 */
export function isAccountQuery(queryKey: readonly unknown[], userUuid: string): boolean {
  return queryKey.includes('account') && queryKey.includes(userUuid)
}

export const queryKeys = {
  communities: {
    all: ['communities'] as const,
    detail: (communityId: number) => ['communities', communityId] as const,
  },
  posts: {
    lists: ['posts', 'list'] as const,
    list: (communityId: number | null, order: 'time' | 'hot') =>
      ['posts', 'list', communityId, order] as const,
    detail: (postId: number) => ['posts', 'detail', postId] as const,
  },
  comments: {
    list: (postId: number) => ['comments', postId] as const,
  },
  votes: {
    byPost: (postId: number) => ['votes', postId] as const,
  },
} as const
