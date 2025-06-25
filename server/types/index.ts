// Define constants for file types
export const IMAGE_TYPES = {
  PRODUCT: "product",
  PROFILE: "profile",
  COVER: "cover",
  MESSAGE_FILE: "message-file",
} as const;

export type ImageType = typeof IMAGE_TYPES[keyof typeof IMAGE_TYPES];