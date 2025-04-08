import React from "react";
import { Filter, SortAsc, SortDesc, ChevronDown, ChevronUp } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProductFiltersProps {
  sortOption: string;
  onSortChange: (value: string) => void;
  onFilterClick?: () => void;
  isFilterOpen?: boolean;
  showFilterToggle?: boolean;
  className?: string;
}

export function ProductFilters({
  sortOption,
  onSortChange,
  onFilterClick,
  isFilterOpen = false,
  showFilterToggle = true,
  className,
}: ProductFiltersProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-between gap-2 pb-4",
        className
      )}
    >
      {/* Sort Dropdown */}
      <div className="flex items-center gap-2">
        <Select value={sortOption} onValueChange={onSortChange}>
          <SelectTrigger className="min-w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="price-low">Price: Low to High</SelectItem>
            <SelectItem value="price-high">Price: High to Low</SelectItem>
            <SelectItem value="rating">Highest Rated</SelectItem>
            <SelectItem value="ending-soon">Ending Soon</SelectItem>
            <SelectItem value="most-bids">Most Bids</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filter Toggle Button (optional) */}
      {showFilterToggle && onFilterClick && (
        <Button
          variant="outline"
          size="sm"
          onClick={onFilterClick}
          className="flex items-center gap-1"
        >
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          {isFilterOpen ? (
            <ChevronUp className="ml-1 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-1 h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}