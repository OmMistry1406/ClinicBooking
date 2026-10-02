'use client';

interface Props {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ message, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Confirm action" className="w-full max-w-sm rounded bg-white p-4 shadow">
        <p className="mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 rounded border px-4">
            Cancel
          </button>
          <button type="button" autoFocus onClick={onConfirm} className="min-h-11 rounded bg-blue-700 px-4 text-white">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
