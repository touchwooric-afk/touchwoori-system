'use client';

import { today, yesterday } from '@/lib/format';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

export default function DatePicker({
  value,
  onChange,
  label,
  required = false,
  className = '',
}: DatePickerProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-danger-600 ml-0.5">*</span>}
        </label>
      )}
      <div className="flex gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm
            focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            outline-none transition-shadow"
        />
        <button
          type="button"
          onClick={() => onChange(today())}
          className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600
            hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          오늘
        </button>
        <button
          type="button"
          onClick={() => onChange(yesterday())}
          className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600
            hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          어제
        </button>
      </div>
    </div>
  );
}
