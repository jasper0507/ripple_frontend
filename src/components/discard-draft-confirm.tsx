import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

export function DiscardDraftConfirm({ onConfirm, onCancel }: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title="清空草稿？" description="已输入的内容将被清空，无法恢复。" onClose={onCancel}>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" data-initial-focus onClick={onCancel}>继续编辑</Button>
        <Button type="button" variant="destructive" onClick={onConfirm}>清空草稿</Button>
      </div>
    </Modal>
  )
}
