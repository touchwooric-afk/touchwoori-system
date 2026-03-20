'use client';

import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  /** 표시할 단축키 힌트. 예: "⌘S", "Esc", "↵" */
  shortcut?: string;
  children: ReactNode;
}

const variantStyles = {
  primary:
    'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-700 hover:to-primary-600 focus-visible:ring-primary-500',
  secondary:
    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:ring-primary-500',
  danger:
    'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-600',
};

const shortcutStyles = {
  primary: 'bg-white/20 text-white/80',
  secondary: 'bg-gray-100 text-gray-400',
  danger: 'bg-white/20 text-white/80',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  shortcut,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg font-medium
        transition-all duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
      {shortcut && !loading && (
        <kbd
          className={`
            inline-flex items-center rounded px-1.5 py-0.5
            font-mono text-[10px] leading-none font-normal
            ${shortcutStyles[variant]}
          `}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
