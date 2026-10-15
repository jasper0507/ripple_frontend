import { PostList } from '@/components/post-list'
import { usePostOrder } from '@/lib/use-post-order'

export function HomePage() {
  const order = usePostOrder()
  return <PostList communityId={null} order={order} heading="全部帖子" />
}
