# Featured Products Duplicate Fix

## Issue
The featured products section on the homepage was showing the same product twice side by side when there was an odd number of featured products.

## Root Cause
In the `FeaturedProductCarousel` component, when determining the second product to display:
```typescript
const secondProduct = currentIndex + 1 < featuredProducts.length ? 
  featuredProducts[currentIndex + 1] : featuredProducts[0];
```

When there was only 1 featured product (or an odd number at the last position), it would wrap around and show `featuredProducts[0]` again, which is the same as the first product.

## Solution
1. **Changed the fallback behavior**: Instead of wrapping to the first product, set `secondProduct` to `null` when there's no next product:
   ```typescript
   const secondProduct = currentIndex + 1 < featuredProducts.length ? 
     featuredProducts[currentIndex + 1] : null;
   ```

2. **Conditional rendering**: Only render the second product card if `secondProduct` exists:
   ```typescript
   {secondProduct && (
     <div className="flex flex-col h-full bg-white rounded-lg...">
       {/* Product content */}
     </div>
   )}
   ```

3. **Responsive grid layout**: Adjusted the grid to show single column when there's only one product:
   ```typescript
   <div className={`grid grid-cols-1 ${secondProduct ? 'md:grid-cols-2' : 'md:grid-cols-1 max-w-md mx-auto'} ...`}>
   ```

4. **Fixed navigation logic**: Updated `handlePrev` and `handleNext` functions to properly handle odd numbers of products without causing duplicates.

5. **Navigation visibility**: Changed condition to show navigation arrows when there's more than 1 product (instead of more than 2).

## Files Modified
- `/client/src/components/ui/featured-product-carousel.tsx`

## Testing
Created a test script that confirmed there was 1 featured product in the database, which would have caused the duplication issue. The fix now properly handles this case by showing only the single product centered in the carousel.