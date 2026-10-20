// components/ui/ListRowIndicator.tsx
import React from 'react';

interface RowProps {
  label: string;
  status: string;
  isUpdating: boolean;
}

export const ListRowIndicator: React.FC<RowProps> = ({ label, status, isUpdating }) => {
  return (
    <div className="flex items-center justify-between p-3 border-b border-muted/10 bg-background hover:bg-muted/5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      
      <div className="flex items-center space-x-2">
        {isUpdating ? (
          <>
            <span className="text-xs text-muted-foreground">Updating</span>
            {/* Ultra-clean micro spinner */}
            <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://w3.org" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{status}</span>
        )}
      </div>
    </div>
  );
};
