'use client';

import { useState, useEffect } from 'react';
import { addCommas } from '@/lib/format';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

export default function CurrencyInput({
  value,
  onChange,
  label,
  required = false,
  placeholder = '0',
  className = '',
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(value ? addCommas(value) : '');

  useEffect(() => {
    setDisplay(value ? addCommas(value) : '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const num = Number(raw) || 0;

    if (num > 99999999) return;

    setDisplay(raw ? addCommas(num) : '');
    onChange(num);
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-danger-600 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
          ₩
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm tabular-nums
            focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            outline-none transition-shadow text-right"
        />
      </div>
    </div>
  );
}
