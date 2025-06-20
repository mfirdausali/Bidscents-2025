import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format currency in Malaysian Ringgit (RM)
 * @param amount - The amount to format (in ringgit, not cents)
 * @param options - Options for formatting
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number | null | undefined,
  options: {
    showDecimals?: boolean;
    fromCents?: boolean;
  } = {}
): string {
  if (amount === null || amount === undefined) return 'N/A';
  
  const { showDecimals = true, fromCents = false } = options;
  
  // Convert from cents if needed
  const value = fromCents ? amount / 100 : amount;
  
  // Use Malaysian locale for proper RM formatting
  const formatter = new Intl.NumberFormat('ms-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });
  
  return formatter.format(value);
}
