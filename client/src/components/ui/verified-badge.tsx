import React, { useState } from "react";
import { CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import { Button } from "./button";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function VerifiedBadge({ size = "md", className }: VerifiedBadgeProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const sizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4.5 w-4.5",
    lg: "h-5.5 w-5.5"
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("inline-flex items-center gap-1 text-primary cursor-pointer", className)} onClick={() => setDialogOpen(true)}>
              <CheckCircle
                className={cn("fill-[#009C41] text-white", sizeClasses[size])}
                aria-hidden="true"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Verified Seller</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 fill-[#009C41] text-white" />
              Verified Seller
            </DialogTitle>
            <DialogDescription>
              A verified seller has met our platform's requirements for trust and reliability.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p>Verified sellers have:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Completed identity verification</li>
              <li>Successfully delivered at least 5 orders</li>
              <li>Maintained a minimum rating of 4.5 stars</li>
              <li>Adhered to our community guidelines</li>
              <li>Confirmed payment methods</li>
            </ul>
            <p>These sellers offer increased buyer protection and are consistently reliable members of our marketplace.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}