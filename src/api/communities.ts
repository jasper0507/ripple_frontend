import { queryOptions } from '@tanstack/react-query'
import { client } from './client'
import { ApiError } from './errors'
import { queryKeys } from './query-keys'
import { getWithRetry, unwrap } from './request'
import type { components, operations } from './types'
import { parseRouteId } from '@/lib/route-id'

/** 路径中的社区 ID。无效时不发请求。 */
export function parseCommunityId(raw: string | undefined): number | null {
  return parseRouteId(raw)
}

export type CommunitySummary = components['schemas']['CommunitySummary']

/** 详情字段以生成契约为准，不手写第二份响应模型。 */
export type Community = NonNullable<
  operations['getCommunity']['responses'][200]['content']['application/json']['data']
>

function isCommunitySummary(value: unknown): value is CommunitySummary {
  if (typeof value !== 'object' || value === null) return false
  const community = value as CommunitySummary
  return typeof community.id === 'number' && typeof community.name === 'string'
}

function assertCommunityList(data: unknown): CommunitySummary[] {
  if (!Array.isArray(data) || data.some((item) => !isCommunitySummary(item))) {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return data
}

function assertCommunity(data: unknown): Community {
  if (
    !isCommunitySummary(data) ||
    typeof (data as Community).introduction !== 'string' ||
    typeof (data as Community).created_at !== 'string'
  ) {
    throw new ApiError('protocol', '响应格式不符合契约')
  }
  return data as Community
}

export async function fetchCommunities(signal?: AbortSignal): Promise<CommunitySummary[]> {
  const data = await getWithRetry(() =>
    unwrap<unknown>(client.GET('/api/v1/communities', { signal })),
  )
  return assertCommunityList(data)
}

export async function fetchCommunity(
  communityId: number,
  signal?: AbortSignal,
): Promise<Community> {
  const data = await getWithRetry(() =>
    unwrap<unknown>(
      client.GET('/api/v1/communities/{communityID}', {
        params: { path: { communityID: communityId } },
        signal,
      }),
    ),
  )
  // 缺失字段不能当成空社区或空简介
  return assertCommunity(data)
}

// 公共数据：社区列表不分页、很少变化，不因账号变化清空。
// 帖子模块复用这份列表（发帖选择、无社区时阻止提交），不另建缓存。
export function communitiesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.communities.all,
    queryFn: ({ signal }) => fetchCommunities(signal),
    staleTime: 5 * 60 * 1000,
  })
}

export function communityQueryOptions(communityId: number) {
  return queryOptions({
    queryKey: queryKeys.communities.detail(communityId),
    queryFn: ({ signal }) => fetchCommunity(communityId, signal),
    staleTime: 5 * 60 * 1000,
  })
}
