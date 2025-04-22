import React from "react";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function VerifiedBadge({ size = "md", className }: VerifiedBadgeProps) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4.5 w-4.5",
    lg: "h-5.5 w-5.5"
  };
  
  return (
    <div className={cn("text-primary", className)}>
      <CheckCircle 
        className={cn(
          "fill-primary text-white", 
          sizeClasses[size]
        )} 
      />
    </div>
  );
}