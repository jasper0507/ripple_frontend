import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

export function DeleteConfirm({ title, description, deleting, error, onConfirm, onCancel }: {
  title: string
  description: string
  deleting: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} description={description} busy={deleting} onClose={onCancel}>
      {error ? <p role="alert" className="feedback feedback-danger mt-4"><AlertTriangle aria-hidden className="mt-1 size-4 shrink-0" />{error}</p> : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" data-initial-focus onClick={onCancel} disabled={deleting}>取消</Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={deleting}>{deleting ? '删除中…' : '确认删除'}</Button>
      </div>
    </Modal>
  )
}
