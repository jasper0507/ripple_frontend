import { useQuery } from '@tanstack/react-query'
import { NavLink } from 'react-router'
import { communitiesQueryOptions } from '@/api/communities'
import { Button } from '@/components/ui/button'

export function CommunityNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { data, isPending, isError, isFetching, refetch } = useQuery(communitiesQueryOptions())
  return (
    <nav aria-label="社区导航" className={className}>
      <ul>
        <li><NavLink to="/" end className="community-link" onClick={onNavigate}>全部帖子</NavLink></li>
        {data?.map((community) => (
          <li key={community.id}><NavLink to={`/communities/${community.id}`} className="community-link" onClick={onNavigate}><span>{community.name}</span></NavLink></li>
        ))}
      </ul>
      {isPending ? <p role="status" className="py-4 text-sm text-muted">社区加载中…</p> : null}
      {isError ? <div className="py-4"><p role="alert" className="text-sm text-danger">社区加载失败</p><Button type="button" variant="link" className="px-0" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? '重试中…' : '重试'}</Button></div> : null}
      {data?.length === 0 ? <p className="py-4 text-sm text-muted">还没有社区。</p> : null}
    </nav>
  )
}
