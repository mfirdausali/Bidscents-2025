import React from "react";
import { CheckCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VerifiedBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  tooltipText?: string;
}

export function VerifiedBadge({
  className,
  size = "md",
  tooltipText = "Verified Seller",
}: VerifiedBadgeProps) {
  // Define size-dependent styles
  const sizeStyles = {
    sm: "h-3.5 w-3.5",
    md: "h-4.5 w-4.5",
    lg: "h-5.5 w-5.5",
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger type="button" className="focus:outline-none">
          <span
            className={cn(
              "inline-flex items-center justify-center text-primary",
              className,
            )}
          >
            <CheckCircle
              className={cn("fill-[#009C41] text-white", sizeStyles[size])}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
