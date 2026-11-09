import { Button } from './Button.jsx';
import { Modal } from './Modal.jsx';

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel, isPending = false, error }) {
  return (
    <Modal title={title} onClose={isPending ? () => {} : onCancel}>
      <p className="text-sm text-slate-600">{message}</p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={isPending}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
