import React from "react";

interface SkeletonProps {
    className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className= ''
}) => {
    return (
        <div
        className={`relative overflow-hidden rounded-md bg-muted/20 dark:bg-muted/10 ${className}`}>
            {/* {The moving diagonal light effect} */}
            <div className="absolute inset-0 -translate-x-full animate-shimmer animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent dark via-white/5 skew-x-12" />
        </div>

    );
};