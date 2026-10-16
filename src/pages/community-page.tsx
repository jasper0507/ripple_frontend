import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { communityQueryOptions, parseCommunityId, type Community } from '@/api/communities'
import { ApiError } from '@/api/errors'
import { PostList } from '@/components/post-list'
import { StatusNotice } from '@/components/status-notice'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'
import type { PostOrder } from '@/lib/post-list'
import { usePostOrder } from '@/lib/use-post-order'

function CommunityLoadFailed({
  retrying,
  onRetry,
}: {
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <section>
      <h1 className="page-title">社区加载失败</h1>
      <p role="alert" className="mt-2 text-sm text-muted">
        暂时无法读取这个社区。
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-4"
        disabled={retrying}
        onClick={onRetry}
      >
        {retrying ? '重试中…' : '重试'}
      </Button>
    </section>
  )
}

function CommunityIntro({ community }: { community: Community }) {
  const introduction = community.introduction.trim()
  return (
    <header className="max-w-[760px] pb-2">
      <h1 className="page-title">{community.name}</h1>
      <p className="mt-2 text-[13px] text-muted">创建于 {formatTimestamp(community.created_at)}</p>
      {introduction.length > 240 ? (
        <details className="community-introduction mt-4">
          <summary className="min-h-11 py-2.5 text-sm font-medium text-primary"><span className="intro-expand">展开简介</span><span className="intro-collapse">收起简介</span></summary>
          <p className="mt-1 text-[15.5px] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">{introduction}</p>
        </details>
      ) : <p className="mt-4 text-[15.5px] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">{introduction || '这个社区还没有简介。'}</p>}
    </header>
  )
}

function CommunityView({ communityId, order }: { communityId: number; order: PostOrder }) {
  const { data, error, isPending, isError, isFetching, refetch } = useQuery(
    communityQueryOptions(communityId),
  )

  if (isPending) {
    return (
      <p role="status" className="text-sm text-muted">
        正在加载社区…
      </p>
    )
  }

  if (isError) {
    if (error instanceof ApiError && error.kind === 'not-found') {
      return <StatusNotice title="社区不存在" detail="没有找到这个社区。" />
    }
    if (error instanceof ApiError && error.kind === 'params') {
      return <StatusNotice title="社区地址无效" detail="地址中的社区编号不正确。" />
    }
    return <CommunityLoadFailed retrying={isFetching} onRetry={() => void refetch()} />
  }

  return (
    <article>
      <CommunityIntro community={data} />
      <section>
        <PostList communityId={communityId} order={order} heading="帖子" headingLevel="h2" scopeLabel={data.name} />
      </section>
    </article>
  )
}

export function CommunityPage() {
  const order = usePostOrder()
  const { communityId } = useParams()
  const id = parseCommunityId(communityId)
  if (id === null) {
    return <StatusNotice title="社区地址无效" detail="地址中的社区编号不正确。" />
  }
  return <CommunityView communityId={id} order={order} />
}
