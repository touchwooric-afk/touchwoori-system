interface StatusBadgeProps {
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'inactive';
  className?: string;
}

const badgeStyles = {
  pending: 'bg-warning-50 text-warning-600',
  approved: 'bg-success-50 text-success-700',
  active: 'bg-success-50 text-success-700',
  rejected: 'bg-danger-50 text-danger-700',
  inactive: 'bg-gray-100 text-gray-500',
};

const badgeLabels = {
  pending: '대기중',
  approved: '승인됨',
  active: '활성',
  rejected: '반려됨',
  inactive: '비활성',
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      role="status"
      className={`
        inline-flex items-center rounded-full px-2.5 py-0.5
        text-xs font-medium
        ${badgeStyles[status]}
        ${className}
      `}
    >
      {badgeLabels[status]}
    </span>
  );
}
