import { z } from 'zod';
import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';

// =====================================================
// REUSABLE SCHEMAS AND UTILITIES
// =====================================================

// Custom error messages for better UX
export const ValidationMessages = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_URL: 'Please enter a valid URL',
  INVALID_ID: 'Invalid ID format',
  INVALID_PRICE: 'Price must be a positive number',
  INVALID_PERCENTAGE: 'Percentage must be between 0 and 100',
  INVALID_YEAR: 'Please enter a valid year',
  INVALID_PAGE: 'Page number must be positive',
  INVALID_LIMIT: 'Limit must be between 1 and 100',
  PASSWORD_MIN: 'Password must be at least 6 characters',
  USERNAME_MIN: 'Username must be at least 3 characters',
  USERNAME_MAX: 'Username cannot exceed 50 characters',
  USERNAME_PATTERN: 'Username can only contain letters, numbers, and underscores',
  BIO_MAX: 'Bio cannot exceed 500 characters',
  ADDRESS_MAX: 'Address cannot exceed 200 characters',
  PRODUCT_NAME_MIN: 'Product name must be at least 3 characters',
  PRODUCT_NAME_MAX: 'Product name cannot exceed 200 characters',
  DESCRIPTION_MAX: 'Description cannot exceed 2000 characters',
  COMMENT_MAX: 'Comment cannot exceed 1000 characters',
  RATING_RANGE: 'Rating must be between 0 and 5',
  STOCK_MIN: 'Stock quantity cannot be negative',
  VOLUME_MIN: 'Volume must be positive',
  MESSAGE_MAX: 'Message cannot exceed 5000 characters',
  FILE_SIZE_MAX: 'File size cannot exceed 10MB',
  IMAGE_SIZE_MAX: 'Image size cannot exceed 5MB',
  AUCTION_DURATION_MIN: 'Auction must run for at least 1 hour',
  AUCTION_DURATION_MAX: 'Auction cannot run for more than 30 days',
  BID_INCREMENT_MIN: 'Bid increment must be at least 0.01',
  STARTING_PRICE_MIN: 'Starting price must be positive',
  RESERVE_PRICE_MIN: 'Reserve price must be higher than starting price',
  BUY_NOW_PRICE_MIN: 'Buy now price must be higher than reserve price',
} as const;

// =====================================================
// SANITIZATION HELPERS
// =====================================================

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p'],
    ALLOWED_ATTR: ['href'],
  });
};

/**
 * Sanitize string to prevent SQL injection
 * This is a basic implementation - in production, use parameterized queries
 */
export const sanitizeSqlString = (str: string): string => {
  // Remove SQL keywords and special characters
  return str
    .replace(/['";\\]/g, '') // Remove quotes and backslashes
    .replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|WHERE|OR|AND|FROM)\b)/gi, '') // Remove SQL keywords
    .trim();
};

/**
 * Sanitize search query for safe database queries
 */
export const sanitizeSearchQuery = (query: string): string => {
  // Remove special characters that could be used in SQL injection
  return query
    .replace(/[%_\[\]'"`;\\]/g, '') // Remove SQL wildcards and special chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 200); // Limit length
};

// =====================================================
// BASIC TYPE SCHEMAS
// =====================================================

// ID validation
export const idSchema = z.coerce.number()
  .int('ID must be an integer')
  .positive('ID must be positive')
  .finite('ID must be a valid number');

// Email validation with additional checks
export const emailSchema = z.string()
  .min(1, ValidationMessages.REQUIRED)
  .email(ValidationMessages.INVALID_EMAIL)
  .refine((email) => validator.isEmail(email), {
    message: ValidationMessages.INVALID_EMAIL,
  });

// URL validation
export const urlSchema = z.string()
  .url(ValidationMessages.INVALID_URL)
  .refine((url) => validator.isURL(url, { protocols: ['http', 'https'] }), {
    message: 'URL must use HTTP or HTTPS protocol',
  });

// Price validation (stored as decimal in DB)
export const priceSchema = z.coerce.number()
  .positive(ValidationMessages.INVALID_PRICE)
  .finite('Price must be a valid number')
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val.toString()), {
    message: 'Price can have maximum 2 decimal places',
  });

// Percentage validation
export const percentageSchema = z.coerce.number()
  .min(0, ValidationMessages.INVALID_PERCENTAGE)
  .max(100, ValidationMessages.INVALID_PERCENTAGE)
  .int('Percentage must be a whole number');

// Year validation
export const yearSchema = z.coerce.number()
  .int('Year must be a whole number')
  .min(1900, 'Year must be after 1900')
  .max(new Date().getFullYear(), 'Year cannot be in the future');

// Username validation
export const usernameSchema = z.string()
  .min(3, ValidationMessages.USERNAME_MIN)
  .max(50, ValidationMessages.USERNAME_MAX)
  .regex(/^[a-zA-Z0-9_]+$/, ValidationMessages.USERNAME_PATTERN);

// Password validation
export const passwordSchema = z.string()
  .min(6, ValidationMessages.PASSWORD_MIN)
  .max(100, 'Password cannot exceed 100 characters');

// Safe text field validation (prevents XSS)
export const safeTextSchema = z.string().transform((val) => sanitizeHtml(val));

// =====================================================
// PAGINATION SCHEMAS
// =====================================================

export const paginationSchema = z.object({
  page: z.coerce.number()
    .int()
    .positive(ValidationMessages.INVALID_PAGE)
    .default(1),
  limit: z.coerce.number()
    .int()
    .min(1, ValidationMessages.INVALID_LIMIT)
    .max(100, ValidationMessages.INVALID_LIMIT)
    .default(12),
});

// =====================================================
// USER ENDPOINT SCHEMAS
// =====================================================

// Update user profile
export const updateUserProfileSchema = z.object({
  firstName: safeTextSchema.max(50, 'First name cannot exceed 50 characters').optional(),
  lastName: safeTextSchema.max(50, 'Last name cannot exceed 50 characters').optional(),
  address: safeTextSchema.max(200, ValidationMessages.ADDRESS_MAX).optional(),
  profileImage: urlSchema.optional(),
  shopName: safeTextSchema.max(100, 'Shop name cannot exceed 100 characters').optional(),
  location: safeTextSchema.max(100, 'Location cannot exceed 100 characters').optional(),
  bio: safeTextSchema.max(500, ValidationMessages.BIO_MAX).optional(),
});

// Update password
export const updatePasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
});

// Avatar/Cover photo upload validation
export const imageUploadSchema = z.object({
  file: z.any().refine((file) => file instanceof File, {
    message: 'File is required',
  }).refine((file) => file.size <= 5 * 1024 * 1024, {
    message: ValidationMessages.IMAGE_SIZE_MAX,
  }).refine((file) => ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type), {
    message: 'Only JPEG, PNG, GIF, and WebP images are allowed',
  }),
});

// =====================================================
// PRODUCT ENDPOINT SCHEMAS  
// =====================================================

// Product listing type enum
export const listingTypeSchema = z.enum(['fixed', 'negotiable', 'auction']);

// Product status enum
export const productStatusSchema = z.enum(['active', 'featured', 'sold', 'archived', 'pending']);

// Box condition enum
export const boxConditionSchema = z.enum(['sealed', 'excellent', 'good', 'fair', 'poor', 'none']);

// Create/Update product
export const productSchema = z.object({
  name: safeTextSchema
    .min(3, ValidationMessages.PRODUCT_NAME_MIN)
    .max(200, ValidationMessages.PRODUCT_NAME_MAX),
  brand: safeTextSchema
    .min(1, 'Brand is required')
    .max(100, 'Brand cannot exceed 100 characters'),
  description: safeTextSchema
    .max(2000, ValidationMessages.DESCRIPTION_MAX)
    .optional(),
  price: priceSchema,
  stockQuantity: z.coerce.number()
    .int()
    .min(0, ValidationMessages.STOCK_MIN)
    .default(1),
  categoryId: idSchema.optional(),
  isNew: z.boolean().default(false),
  // Perfume-specific fields
  remainingPercentage: percentageSchema.default(100),
  batchCode: safeTextSchema.max(50, 'Batch code cannot exceed 50 characters').optional(),
  purchaseYear: yearSchema.optional(),
  boxCondition: boxConditionSchema.optional(),
  listingType: listingTypeSchema.default('fixed'),
  status: productStatusSchema.default('active'),
  volume: z.coerce.number()
    .positive(ValidationMessages.VOLUME_MIN)
    .int('Volume must be a whole number')
    .optional(),
});

// Product search/filter schema
export const productFilterSchema = z.object({
  category: idSchema.optional(),
  brand: safeTextSchema.optional(),
  minPrice: priceSchema.optional(),
  maxPrice: priceSchema.optional(),
  search: z.string()
    .max(200, 'Search query too long')
    .transform(sanitizeSearchQuery)
    .optional(),
  status: productStatusSchema.optional(),
  sort: z.enum(['newest', 'price-low', 'price-high', 'rating']).optional(),
}).merge(paginationSchema);

// Product image schema
export const productImageSchema = z.object({
  productId: idSchema,
  imageUrl: z.string(), // UUID from file storage
  imageOrder: z.coerce.number().int().min(0).default(0),
  imageName: safeTextSchema.max(255, 'Image name too long').optional(),
});

// =====================================================
// AUCTION ENDPOINT SCHEMAS
// =====================================================

// Create auction
export const createAuctionSchema = z.object({
  productId: idSchema,
  startingPrice: priceSchema.refine((val) => val > 0, {
    message: ValidationMessages.STARTING_PRICE_MIN,
  }),
  reservePrice: priceSchema.optional().nullable(),
  buyNowPrice: priceSchema.optional().nullable(),
  bidIncrement: priceSchema
    .default(5.00)
    .refine((val) => val >= 0.01, {
      message: ValidationMessages.BID_INCREMENT_MIN,
    }),
  startsAt: z.string().datetime().optional(), // Will default to now if not provided
  endsAt: z.string().datetime(),
}).refine((data) => {
  // Validate reserve price is higher than starting price
  if (data.reservePrice && data.reservePrice <= data.startingPrice) {
    return false;
  }
  return true;
}, {
  message: ValidationMessages.RESERVE_PRICE_MIN,
  path: ['reservePrice'],
}).refine((data) => {
  // Validate buy now price is higher than reserve price (if both exist)
  if (data.buyNowPrice && data.reservePrice && data.buyNowPrice <= data.reservePrice) {
    return false;
  }
  return true;
}, {
  message: ValidationMessages.BUY_NOW_PRICE_MIN,
  path: ['buyNowPrice'],
}).refine((data) => {
  // Validate auction duration
  const start = data.startsAt ? new Date(data.startsAt) : new Date();
  const end = new Date(data.endsAt);
  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  
  if (durationHours < 1) {
    return false;
  }
  if (durationHours > 30 * 24) { // 30 days
    return false;
  }
  return true;
}, {
  message: 'Auction duration must be between 1 hour and 30 days',
  path: ['endsAt'],
});

// Update auction (limited fields when bids exist)
export const updateAuctionSchema = z.object({
  buyNowPrice: priceSchema.optional().nullable(),
  // Add other safe-to-update fields here
});

// Place bid
export const placeBidSchema = z.object({
  auctionId: idSchema,
  amount: priceSchema,
  userId: idSchema.optional(), // For WebSocket fallback
});

// =====================================================
// REVIEW ENDPOINT SCHEMAS
// =====================================================

export const createReviewSchema = z.object({
  productId: idSchema,
  sellerId: idSchema.optional(),
  rating: z.coerce.number()
    .min(0, ValidationMessages.RATING_RANGE)
    .max(5, ValidationMessages.RATING_RANGE)
    .refine((val) => val % 0.5 === 0, {
      message: 'Rating must be in increments of 0.5',
    }),
  comment: safeTextSchema
    .max(1000, ValidationMessages.COMMENT_MAX)
    .optional(),
});

// =====================================================
// MESSAGE ENDPOINT SCHEMAS
// =====================================================

// Message types
export const messageTypeSchema = z.enum(['TEXT', 'ACTION', 'FILE']);
export const actionTypeSchema = z.enum(['INITIATE', 'CONFIRM_PAYMENT', 'CONFIRM_DELIVERY', 'REVIEW']);

// Send message
export const sendMessageSchema = z.object({
  receiverId: idSchema,
  content: safeTextSchema
    .max(5000, ValidationMessages.MESSAGE_MAX)
    .optional()
    .nullable(),
  productId: idSchema.optional().nullable(),
  messageType: messageTypeSchema.default('TEXT'),
  actionType: actionTypeSchema.optional(),
});

// Message file upload
export const messageFileUploadSchema = z.object({
  receiverId: idSchema,
  productId: idSchema.optional(),
  file: z.any().refine((file) => file instanceof File, {
    message: 'File is required',
  }).refine((file) => file.size <= 10 * 1024 * 1024, {
    message: ValidationMessages.FILE_SIZE_MAX,
  }).refine((file) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    return allowedTypes.includes(file.type);
  }, {
    message: 'Only images, PDFs, and common document types are allowed',
  }),
});

// Mark messages as read
export const markMessagesReadSchema = z.object({
  messageId: idSchema.optional(),
  senderId: idSchema.optional(),
}).refine((data) => data.messageId !== undefined || data.senderId !== undefined, {
  message: 'Either messageId or senderId must be provided',
});

// Confirm action message
export const confirmActionSchema = z.object({
  messageId: idSchema,
});

// Submit review from message
export const submitReviewFromMessageSchema = z.object({
  rating: z.coerce.number()
    .min(0, ValidationMessages.RATING_RANGE)
    .max(5, ValidationMessages.RATING_RANGE),
  comment: safeTextSchema
    .max(1000, ValidationMessages.COMMENT_MAX)
    .optional(),
  productId: idSchema,
  sellerId: idSchema.optional(),
});

// =====================================================
// ADMIN ENDPOINT SCHEMAS
// =====================================================

// Ban/unban user
export const banUserSchema = z.object({
  isBanned: z.boolean(),
});

// Update order status
export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
});

// Remove product with reason
export const removeProductSchema = z.object({
  reason: safeTextSchema
    .min(1, 'Reason is required')
    .max(500, 'Reason cannot exceed 500 characters'),
});

// =====================================================
// PAYMENT/BOOST ENDPOINT SCHEMAS
// =====================================================

// Create boost order
export const createBoostOrderSchema = z.object({
  boostPackageId: idSchema,
  productIds: z.array(idSchema)
    .min(1, 'At least one product must be selected')
    .max(10, 'Cannot boost more than 10 products at once'),
});

// Process payment redirect
export const paymentRedirectSchema = z.object({
  'billplz[id]': z.string().min(1, 'Bill ID is required'),
  'billplz[x_signature]': z.string().min(1, 'Signature is required'),
  // Other Billplz parameters are optional
});

// =====================================================
// AUTHENTICATION SCHEMAS
// =====================================================

// Session creation
export const createSessionSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Email lookup
export const lookupEmailSchema = z.object({
  email: emailSchema,
});

// Password reset request
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

// OAuth sync
export const syncOAuthUserSchema = z.object({
  email: emailSchema,
  providerId: z.string().min(1, 'Provider ID is required'),
  provider: z.string().min(1, 'Provider is required'),
});

// =====================================================
// QUERY PARAMETER SCHEMAS
// =====================================================

// Get conversation query params
export const conversationQuerySchema = z.object({
  productId: idSchema.optional(),
});

// Get seller products query params  
export const sellerProductsQuerySchema = z.object({
  status: productStatusSchema.optional(),
  category: z.string().optional(),
  sort: z.enum(['newest', 'price-low', 'price-high', 'rating']).optional(),
}).merge(paginationSchema);

// =====================================================
// VALIDATION MIDDLEWARE FACTORY
// =====================================================

/**
 * Creates Express middleware for validating request data
 */
export function validateRequest(schema: z.ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: any, res: any, next: any) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      req[source] = validated; // Replace with validated/sanitized data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      next(error);
    }
  };
}

// =====================================================
// EXPORTS FOR SPECIFIC ENDPOINTS
// =====================================================

export const ValidationSchemas = {
  // User endpoints
  updateProfile: updateUserProfileSchema,
  updatePassword: updatePasswordSchema,
  uploadAvatar: imageUploadSchema,
  uploadCover: imageUploadSchema,

  // Product endpoints
  createProduct: productSchema,
  updateProduct: productSchema,
  filterProducts: productFilterSchema,
  createProductImage: productImageSchema,

  // Auction endpoints
  createAuction: createAuctionSchema,
  updateAuction: updateAuctionSchema,
  placeBid: placeBidSchema,

  // Review endpoints
  createReview: createReviewSchema,
  submitReviewFromMessage: submitReviewFromMessageSchema,

  // Message endpoints
  sendMessage: sendMessageSchema,
  uploadMessageFile: messageFileUploadSchema,
  markMessagesRead: markMessagesReadSchema,
  confirmAction: confirmActionSchema,

  // Admin endpoints
  banUser: banUserSchema,
  updateOrderStatus: updateOrderStatusSchema,
  removeProduct: removeProductSchema,

  // Payment/Boost endpoints
  createBoostOrder: createBoostOrderSchema,
  paymentRedirect: paymentRedirectSchema,

  // Auth endpoints
  createSession: createSessionSchema,
  lookupEmail: lookupEmailSchema,
  passwordResetRequest: passwordResetRequestSchema,
  syncOAuthUser: syncOAuthUserSchema,

  // Query parameters
  pagination: paginationSchema,
  conversationQuery: conversationQuerySchema,
  sellerProductsQuery: sellerProductsQuerySchema,
} as const;

// Type exports for TypeScript
export type UpdateUserProfile = z.infer<typeof updateUserProfileSchema>;
export type CreateProduct = z.infer<typeof productSchema>;
export type CreateAuction = z.infer<typeof createAuctionSchema>;
export type PlaceBid = z.infer<typeof placeBidSchema>;
export type CreateReview = z.infer<typeof createReviewSchema>;
export type SendMessage = z.infer<typeof sendMessageSchema>;
export type CreateBoostOrder = z.infer<typeof createBoostOrderSchema>;
export type ProductFilter = z.infer<typeof productFilterSchema>;
export type Pagination = z.infer<typeof paginationSchema>;