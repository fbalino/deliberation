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

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({ variant = 'default', className = '', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
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
