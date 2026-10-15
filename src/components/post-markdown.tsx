import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'

// 不启用 rehype-raw，原始 HTML 不会被执行。图片只留下替代文字，避免发起图片请求。
const components: Components = {
  img({ alt }) {
    if (!alt) return null
    return <span>{alt}</span>
  },
}

export function PostMarkdown({ content }: { content: string }) {
  return (
    <div className="post-body">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  )
}
