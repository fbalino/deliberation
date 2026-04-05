type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--surface-inset)', color: 'var(--text-secondary)' },
  success: { background: 'var(--success-subtle)', color: 'var(--success-text)' },
  warning: { background: 'var(--warning-subtle)', color: 'var(--warning-text)' },
  danger: { background: 'var(--danger-subtle)', color: 'var(--danger-text)' },
  info: { background: 'var(--info-subtle)', color: 'var(--info-text)' },
  purple: { background: 'var(--purple-subtle)', color: 'var(--purple-text)' },
};

export function Badge({ variant = 'default', className = '', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${className}`}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, BadgeVariant> = {
    configuring: 'default',
    briefing: 'info',
    analyzing: 'info',
    discussing: 'info',
    drafter_election: 'info',
    drafting: 'purple',
    voting: 'warning',
    completed: 'success',
    abandoned: 'danger',
  };

  const labelMap: Record<string, string> = {
    configuring: 'Configuring',
    briefing: 'Briefing',
    analyzing: 'Analyzing',
    discussing: 'Discussing',
    drafter_election: 'Electing Drafter',
    drafting: 'Drafting',
    voting: 'Voting',
    completed: 'Completed',
    abandoned: 'Abandoned',
  };

  return (
    <Badge variant={variantMap[status] || 'default'}>
      {labelMap[status] || status}
    </Badge>
  );
}
