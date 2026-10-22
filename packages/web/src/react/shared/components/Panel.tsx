import { cn } from '../utils/cn';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  variant?: 'default' | 'minimal';
  onClose?: () => void;
}

export function Panel({ children, className, title, variant = 'default', onClose }: PanelProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn('relative', className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative glass-panel animate-fade-in p-5',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-future-primary to-future-secondary rounded-full" />
            <h3 className="text-white font-semibold text-sm tracking-wide">
              {title}
            </h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 text-xs"
              title="Close panel"
              aria-label="Close panel"
            >
              ✕
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}


