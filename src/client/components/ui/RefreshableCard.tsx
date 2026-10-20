// components/ui/RefreshableCard.tsx
import React from 'react';

interface CardProps {
  title: string;
  value: string;
  isLoading: boolean;
}

export const RefreshableCard: React.FC<CardProps> = ({ title, value, isLoading }) => {
  return (
    <div className="relative overflow-hidden rounded-xl border border-muted/20 bg-card p-5 shadow-sm">
      {/* Subtle top slider bar indicator when background updating */}
      {isLoading && (
        <div className="absolute top-0 left-0 h-[2px] w-full bg-primary animate-pulse" />
      )}

      {/* Content wrapper drops opacity gracefully during reload */}
      <div className={`transition-opacity duration-200 ${isLoading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
      </div>
    </div>
  );
};
