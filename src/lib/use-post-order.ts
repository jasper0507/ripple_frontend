import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { parsePostOrder, type PostOrder } from './post-list'

/** 排序只认 time / hot。其他值从地址里去掉，不发给后端。 */
export function usePostOrder(): PostOrder {
  const [params, setParams] = useSearchParams()
  const raw = params.get('order')
  useEffect(() => {
    if (raw === null || raw === 'time' || raw === 'hot') return
    const next = new URLSearchParams(params)
    next.delete('order')
    setParams(next, { replace: true })
  }, [raw, params, setParams])
  return parsePostOrder(raw)
}
