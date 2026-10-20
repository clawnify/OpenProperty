// components/skeletons/DashboardSkeleton.tsx
import React from 'react';
import { Card } from '@/components/ui/card'; // Adjust path based on your setup
import { ShimmerBlock } from '../ui/ShimmerBlock';

export const DashboardSkeleton: React.FC = () => {
  // Generate a healthy list of rows to dynamically fill out a taller screen layout
  const skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  return (
    <div className="flex w-full min-h-screen bg-background">
      {/* 1. Left Sidebar Space Placeholder (If your actual sidebar isn't already visible) */}
      {/* <div className="hidden md:block w-64 border-r border-border h-screen bg-card" /> */}

      {/* 2. Main Dashboard Container (Takes up 100% of all remaining space) */}
      <div className="flex-1 w-full p-6 space-y-6 overflow-y-auto">
        
        {/* Dynamic Header Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <ShimmerBlock className="h-3 w-16" />
              <ShimmerBlock className="h-6 w-28" />
            </Card>
          ))}
        </div>

        {/* Dynamic Main Body List - Upgraded with your clean Card layout */}
        <Card className="divide-y divide-border overflow-hidden w-full h-auto" role="status" aria-label="Loading tenants">
          {skeletonRows.map((i) => (
            <div key={i} className="flex h-14 items-center gap-4 px-4" aria-hidden>
              {/* Dynamic Column 1 (Large / Name) */}
              <ShimmerBlock className="h-3 w-32 sm:w-48" />
              
              {/* Dynamic Column 2 (Medium / Detail) */}
              <ShimmerBlock className="h-3 w-24 sm:w-36" />
              
              {/* Dynamic Column 3 (Hidden on mobile, fluid on desktop) */}
              <ShimmerBlock className="hidden md:block h-3 w-28" />
              
              {/* Dynamic Column 4 (Right-aligned / Action status) */}
              <ShimmerBlock className="ml-auto h-3 w-16 sm:w-20" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};
