// components/ui/ShimmerBlock.tsx
import React from 'react';

interface ShimmerBlockProps {
  className?: string;
}

export const ShimmerBlock: React.FC<ShimmerBlockProps> = ({ className = '' }) => {
  return (
    <div className={`relative overflow-hidden bg-muted/40 dark:bg-muted/20 rounded-full ${className}`}>
      {/* The moving diagonal light gradient layer */}
      <div className="absolute inset-0 -translate-x-full animate-shimmer animate-pulse bg-gradient-to-r from-transparent via-muted-foreground/10 to-transparent skew-x-12" />
    </div>
  );
};
