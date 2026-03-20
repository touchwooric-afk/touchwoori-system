'use client';

import Button from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl animate-scale-up p-6"
      >
        <h3 id="confirm-title" className="text-lg font-semibold text-gray-900">
          {title}
        </h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex gap-3 justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
