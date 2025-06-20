import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ProductWithDetails,
  InsertProduct,
  Category,
  InsertAuction,
} from "@shared/schema";
import { formatDate, formatTime, formatDateTimeNice } from "@/lib/date-utils";
// Removed legacy boost option selector import
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Package,
  Plus,
  Edit,
  Trash,
  Search,
  Loader2,
  ShoppingBag,
  DollarSign,
  Star,
  Upload,
  X,
  Timer,
  Tag,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-supabase-auth";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define listing type selection schema
const listingTypeSchema = z.object({
  listingType: z.enum(["fixed", "auction"]),
});

type ListingTypeFormValues = z.infer<typeof listingTypeSchema>;

// Define product form schema (for fixed price listings)
const productSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  brand: z.string().min(2, { message: "Brand must be at least 2 characters" }),
  description: z
    .string()
    .min(10, { message: "Description must be at least 10 characters" }),
  price: z.number().min(0.01, { message: "Price must be greater than 0" }),
  imageUrl: z.string().url({ message: "Please enter a valid image URL" }), // Keep for compatibility, will be updated in backend
  imageFiles: z.any().optional(), // Will hold the actual file objects for upload
  stockQuantity: z
    .number()
    .int()
    .min(0, { message: "Stock quantity must be 0 or greater" }),
  categoryId: z
    .number()
    .int()
    .positive({ message: "Please select a category" }),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  // Secondhand perfume specific fields
  remainingPercentage: z.number().int().min(1).max(100).default(100),
  batchCode: z.string().optional(),
  purchaseYear: z
    .number()
    .int()
    .min(1970)
    .max(new Date().getFullYear())
    .optional(),
  boxCondition: z.enum(["Good", "Damaged", "No Box"]).default("Good"),
  listingType: z.enum(["fixed", "negotiable"]).default("fixed"),
  volume: z
    .number()
    .int()
    .min(1, { message: "Please enter a valid volume (e.g. 50ml, 100ml)" }),
});

// Define auction form schema
const auctionSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  brand: z.string().min(2, { message: "Brand must be at least 2 characters" }),
  description: z
    .string()
    .min(10, { message: "Description must be at least 10 characters" }),
  startingPrice: z
    .number()
    .min(0.01, { message: "Starting price must be greater than 0" }),
  reservePrice: z.number().optional(),
  buyNowPrice: z.number().optional(),
  bidIncrement: z
    .number()
    .min(0.10, { message: "Bid increment must be at least RM0.10" })
    .default(0.10),
  auctionEndDate: z
    .date()
    .min(new Date(), { message: "End date must be in the future" }),
  imageUrl: z
    .string()
    .url({ message: "Please enter a valid image URL" })
    .optional(),
  imageFiles: z.any().optional(),
  stockQuantity: z
    .number()
    .int()
    .min(1, { message: "Stock quantity must be at least 1" })
    .default(1),
  categoryId: z
    .number()
    .int()
    .positive({ message: "Please select a category" }),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  // Secondhand perfume specific fields
  remainingPercentage: z.number().int().min(1).max(100).default(100),
  batchCode: z.string().optional(),
  purchaseYear: z
    .number()
    .int()
    .min(1970)
    .max(new Date().getFullYear())
    .optional(),
  boxCondition: z.enum(["Good", "Damaged", "No Box"]).default("Good"),
  volume: z
    .number()
    .int()
    .min(1, { message: "Please enter a valid volume (e.g. 50ml, 100ml)" }),
});

type ProductFormValues = z.infer<typeof productSchema>;
type AuctionFormValues = z.infer<typeof auctionSchema>;

export default function SellerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState("products");
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false);
  const [selectedListingType, setSelectedListingType] = useState<
    "fixed" | "auction"
  >("fixed");
  const [isAuctionForm, setIsAuctionForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<
    { id: string; url: string }[]
  >([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [boostedProducts, setBoostedProducts] = useState<number[]>([]);
  const [boostedProductIds, setBoostedProductIds] = useState<number[]>([]);
  // Removed selectedBoostOption state - now using package selection directly
  const [isBoostDialogOpen, setIsBoostDialogOpen] = useState(false);

  // Check for payment redirect parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const paymentStatus = searchParams.get("payment");
    const paymentMessage = searchParams.get("message");

    if (paymentStatus && paymentMessage) {
      // Handle payment status
      if (paymentStatus === "success") {
        toast({
          title: "Payment Successful",
          description: decodeURIComponent(paymentMessage),
          variant: "default",
          className: "bg-green-100 border-green-400 text-green-800",
        });

        // Force a refresh of the products data
        queryClient.invalidateQueries({
          queryKey: ["/api/seller/products", user?.id],
        });
      } else if (paymentStatus === "failed") {
        toast({
          title: "Payment Failed",
          description: decodeURIComponent(paymentMessage),
          variant: "destructive",
        });
      } else if (paymentStatus === "error") {
        toast({
          title: "Payment Error",
          description: decodeURIComponent(paymentMessage),
          variant: "destructive",
        });
      }

      // Clean up the URL to prevent duplicate notifications on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [location, toast]);

  // Fetch seller's products
  const { data: products, isLoading: isLoadingProducts } = useQuery<
    ProductWithDetails[]
  >({
    queryKey: ["/api/seller/products", user?.id],
    queryFn: async ({ queryKey }) => {
      // Add the sellerId as a query parameter if we have the user
      const endpoint = user?.id
        ? `/api/seller/products?sellerId=${user.id}`
        : "/api/seller/products";

      const res = await fetch(endpoint, { credentials: "include" });

      if (!res.ok) {
        throw new Error("Failed to fetch seller products");
      }

      return await res.json();
    },
    enabled: !!user,
  });

  // Fetch categories for the dropdown
  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Listing type selection form
  const listingTypeForm = useForm<ListingTypeFormValues>({
    resolver: zodResolver(listingTypeSchema),
    defaultValues: {
      listingType: "fixed",
    },
  });

  // Product form for fixed price listings
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      brand: "",
      description: "",
      price: 0,
      imageUrl: "",
      stockQuantity: 0,
      categoryId: 0,
      isNew: false,
      isFeatured: false,
      // Secondhand perfume specific fields
      remainingPercentage: 100,
      batchCode: "",
      purchaseYear: new Date().getFullYear(),
      boxCondition: "Good",
      listingType: "fixed",
      volume: 100,
    },
  });

  // Auction form
  const auctionForm = useForm<AuctionFormValues>({
    resolver: zodResolver(auctionSchema),
    defaultValues: {
      name: "",
      brand: "",
      description: "",
      startingPrice: 0,
      reservePrice: undefined,
      buyNowPrice: undefined,
      bidIncrement: 0.10,
      auctionEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      imageUrl: "",
      stockQuantity: 1,
      categoryId: 0,
      isNew: false,
      isFeatured: false,
      // Secondhand perfume specific fields
      remainingPercentage: 100,
      batchCode: "",
      purchaseYear: new Date().getFullYear(),
      boxCondition: "Good",
      volume: 100,
    },
  });

  // Create product mutation
  const createProductMutation = useMutation({
    mutationFn: async (product: InsertProduct) => {
      const res = await apiRequest("POST", "/api/products", product);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Product created",
        description: "Your product has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error creating product",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update product mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({
      id,
      product,
    }: {
      id: number;
      product: InsertProduct;
    }) => {
      const res = await apiRequest("PUT", `/api/products/${id}`, product);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Product updated",
        description: "Your product has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
      setIsDialogOpen(false);
      setIsEditMode(false);
      setCurrentProductId(null);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error updating product",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (id: number) => {
      // Include the seller ID in the query parameter
      await apiRequest(
        "DELETE",
        `/api/products/${id}?sellerId=${user?.id || 0}`,
      );
    },
    onSuccess: () => {
      toast({
        title: "Product deleted",
        description: "Your product has been deleted successfully",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/seller/products", user?.id],
      });
      setIsDeleting(null);
    },
    onError: (error) => {
      toast({
        title: "Error deleting product",
        description: error.message,
        variant: "destructive",
      });
      setIsDeleting(null);
    },
  });

  // Mutation for registering image IDs and uploading images
  const registerImagesMutation = useMutation({
    mutationFn: async ({
      productId,
      images,
    }: {
      productId: number;
      images: File[];
    }) => {
      // Step 1: Create placeholder entries for each image in the database
      const registerPromises = images.map(async (file, index) => {
        // Generate a random UUID for the image - this will be used both in the database
        // and as the actual object storage key to ensure consistency
        const imageId = crypto.randomUUID();
        const imageUrl = `image-id-${imageId}`;

        console.log(
          `Creating product image with ID: ${imageUrl} for file: ${file.name}`,
        );

        // Register the image metadata in the database
        const registerResponse = await fetch("/api/product-images", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId,
            imageUrl: imageUrl, // Use the same imageUrl that we'll use for storage
            imageOrder: index,
            imageName: file.name || `Image ${index + 1}`,
            sellerId: user?.id || 0, // Include seller ID for authorization
          }),
        });

        if (!registerResponse.ok) {
          throw new Error(`Failed to register image ${index}`);
        }

        // Get the registered image record with its ID
        const registeredImage = await registerResponse.json();

        // Step 2: Upload the actual image file to object storage
        const formData = new FormData();
        formData.append("image", file);
        formData.append("sellerId", String(user?.id || 0)); // Include seller ID for authorization

        console.log(
          "About to upload image to storage for product image id:",
          registeredImage.id,
        );
        const uploadResponse = await fetch(
          `/api/product-images/${registeredImage.id}/upload`,
          {
            method: "POST",
            body: formData,
          },
        );
        console.log("Upload response status:", uploadResponse.status);

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload image ${index}`);
        }

        return await uploadResponse.json();
      });

      return Promise.all(registerPromises);
    },
    onSuccess: () => {
      console.log("Images registered and uploaded successfully");
      // Clear the image upload state after successful upload
      setUploadedImages([]);
      setImagePreviewUrls([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Error with images",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmitProduct = async (data: ProductFormValues) => {
    // Include sellerId from the logged-in user
    const productWithSellerId = {
      ...data,
      sellerId: user?.id || 0,
    };

    try {
      let productId: number;

      if (isEditMode && currentProductId) {
        const updatedProduct = await updateProductMutation.mutateAsync({
          id: currentProductId,
          product: productWithSellerId,
        });
        productId = updatedProduct.id;

        // Process any images marked for deletion
        if (imagesToDelete.length > 0) {
          console.log("Deleting images:", imagesToDelete);

          // Delete each image one by one
          for (const imageId of imagesToDelete) {
            try {
              await apiRequest(
                "DELETE",
                `/api/products/${currentProductId}/images/${imageId}?sellerId=${user?.id || 0}`,
                null,
              );
              console.log(`Successfully deleted image ${imageId}`);
            } catch (error) {
              console.error(`Failed to delete image ${imageId}:`, error);
            }
          }

          // Clear the deletion list after processing
          setImagesToDelete([]);
        }
      } else {
        const newProduct =
          await createProductMutation.mutateAsync(productWithSellerId);
        productId = newProduct.id;
      }

      // After product is created/updated, register and upload images
      if (uploadedImages.length > 0) {
        await registerImagesMutation.mutateAsync({
          productId,
          images: uploadedImages,
        });
      }

      // Clear image states
      setUploadedImages([]);
      setImagePreviewUrls([]);
      setExistingImages([]);

      // Close dialog after successful submission
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error in product submission:", error);
    }
  };

  // Query to fetch product images
  const { data: productImages } = useQuery({
    queryKey: ["product-images", currentProductId],
    queryFn: async () => {
      if (!currentProductId) return [];

      const response = await fetch(`/api/product-images/${currentProductId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch product images");
      }
      const images = await response.json();

      // Update the existingImages state when productImages are fetched
      const formattedImages = images.map((img: any) => ({
        id: String(img.id),
        url: img.imageUrl,
      }));
      setExistingImages(formattedImages);

      // Create preview URLs for existing images
      const previewUrls = images.map(
        (image: any) => `/api/images/${image.imageUrl}`,
      );
      setImagePreviewUrls(previewUrls);

      return images;
    },
    enabled: !!currentProductId && isEditMode,
  });

  // Edit product
  const handleEditProduct = (product: ProductWithDetails) => {
    setIsEditMode(true);
    setCurrentProductId(product.id);

    // Clear existing image preview states
    setUploadedImages([]);
    imagePreviewUrls.forEach((url) => {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    });
    setImagePreviewUrls([]);
    setExistingImages([]);
    setImagesToDelete([]);

    // If the product has images in the product.images array, set them up for preview
    if (product.images && product.images.length > 0) {
      console.log("Found existing product images:", product.images);

      // Store the existing images for tracking
      const existingImagesData = product.images.map((img) => ({
        id: img.id,
        url: img.imageUrl,
      }));
      setExistingImages(existingImagesData);

      // Set up preview URLs for display
      const existingImageUrls = product.images.map(
        (img) => `/api/images/${img.imageUrl}`,
      );
      setImagePreviewUrls(existingImageUrls);
    }
    // Fallback to the old imageUrl field if no images in the table
    else if (product.imageUrl) {
      setImagePreviewUrls([`/api/images/${product.imageUrl}`]);
    }

    // Check if this is an auction listing
    if (product.listingType === "auction") {
      setIsAuctionForm(true);

      // If the product has auction data, fetch it or use existing data
      if (product.auction) {
        console.log("Loading auction data for edit:", product.auction);

        // Convert the date string to a Date object for the form
        const endsAtDate = product.auction.endsAt
          ? new Date(product.auction.endsAt)
          : new Date();
        // Add a day to ensure the date is in the future when editing
        if (endsAtDate < new Date()) {
          endsAtDate.setDate(endsAtDate.getDate() + 1);
        }

        // Reset the auction form with the auction data
        auctionForm.reset({
          name: product.name,
          brand: product.brand,
          description: product.description || "",
          startingPrice: product.auction.startingPrice || product.price,
          reservePrice: product.auction.reservePrice || 0,
          buyNowPrice: product.auction.buyNowPrice || 0,
          bidIncrement: product.auction.bidIncrement || 0.10,
          auctionEndDate: endsAtDate,
          imageUrl: product.imageUrl || "",
          stockQuantity: product.stockQuantity,
          categoryId: product.categoryId || 1,
          isNew: product.isNew === null ? false : product.isNew,
          isFeatured: product.isFeatured === null ? false : product.isFeatured,
          // Secondhand perfume specific fields
          remainingPercentage: product.remainingPercentage || 100,
          batchCode: product.batchCode || "",
          purchaseYear: product.purchaseYear || new Date().getFullYear(),
          boxCondition:
            (product.boxCondition as "Good" | "Damaged" | "No Box") || "Good",
          volume: product.volume || 100,
        });
      } else {
        // If no auction data is found, we need to fetch it
        const fetchAuctionData = async () => {
          try {
            const response = await fetch(`/api/auctions/product/${product.id}`);
            if (response.ok) {
              const auctionData = await response.json();
              console.log("Fetched auction data:", auctionData);

              if (auctionData) {
                // Convert the date string to a Date object
                const endsAtDate = auctionData.endsAt
                  ? new Date(auctionData.endsAt)
                  : new Date();
                // Add a day to ensure the date is in the future when editing
                if (endsAtDate < new Date()) {
                  endsAtDate.setDate(endsAtDate.getDate() + 1);
                }

                // Reset form with fetched auction data
                auctionForm.reset({
                  name: product.name,
                  brand: product.brand,
                  description: product.description || "",
                  startingPrice: auctionData.startingPrice || product.price,
                  reservePrice: auctionData.reservePrice || 0,
                  buyNowPrice: auctionData.buyNowPrice || 0,
                  bidIncrement: auctionData.bidIncrement || 0.10,
                  auctionEndDate: endsAtDate,
                  imageUrl: product.imageUrl || "",
                  stockQuantity: product.stockQuantity,
                  categoryId: product.categoryId || 1,
                  isNew: product.isNew === null ? false : product.isNew,
                  isFeatured:
                    product.isFeatured === null ? false : product.isFeatured,
                  // Secondhand perfume specific fields
                  remainingPercentage: product.remainingPercentage || 100,
                  batchCode: product.batchCode || "",
                  purchaseYear:
                    product.purchaseYear || new Date().getFullYear(),
                  boxCondition:
                    (product.boxCondition as "Good" | "Damaged" | "No Box") ||
                    "Good",
                  volume: product.volume || 100,
                });
              }
            } else {
              console.error("Failed to fetch auction data");
              // Fallback to product data without auction specifics
              auctionForm.reset({
                name: product.name,
                brand: product.brand,
                description: product.description || "",
                startingPrice: product.price,
                reservePrice: 0,
                buyNowPrice: 0,
                bidIncrement: 0.10,
                auctionEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
                imageUrl: product.imageUrl || "",
                stockQuantity: product.stockQuantity,
                categoryId: product.categoryId || 1,
                isNew: product.isNew === null ? false : product.isNew,
                isFeatured:
                  product.isFeatured === null ? false : product.isFeatured,
                remainingPercentage: product.remainingPercentage || 100,
                batchCode: product.batchCode || "",
                purchaseYear: product.purchaseYear || new Date().getFullYear(),
                boxCondition:
                  (product.boxCondition as "Good" | "Damaged" | "No Box") ||
                  "Good",
                volume: product.volume || 100,
              });
            }
          } catch (error) {
            console.error("Error fetching auction data:", error);
          }
        };

        // Call the async function to fetch auction data
        fetchAuctionData();
      }
    } else {
      setIsAuctionForm(false);
      form.reset({
        name: product.name,
        brand: product.brand,
        description: product.description || "",
        price: product.price,
        imageUrl: product.imageUrl || "",
        stockQuantity: product.stockQuantity,
        categoryId: product.categoryId || 1,
        isNew: product.isNew === null ? false : product.isNew,
        isFeatured: product.isFeatured === null ? false : product.isFeatured,
        // Secondhand perfume specific fields
        remainingPercentage: product.remainingPercentage || 100,
        batchCode: product.batchCode || "",
        purchaseYear: product.purchaseYear || new Date().getFullYear(),
        boxCondition:
          (product.boxCondition as "Good" | "Damaged" | "No Box") || "Good",
        listingType: (product.listingType as "fixed" | "negotiable") || "fixed",
        volume: product.volume || 100,
      });
    }

    setIsDialogOpen(true);
  };

  // Delete product
  const handleDeleteProduct = (id: number) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      setIsDeleting(id);
      // When deleting a product, backend should cascade delete all related images
      deleteProductMutation.mutate(id);
    }
  };

  // Handle image uploads
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // Limit to 5 images total (existing + new)
    const maxNewImages = 5 - (isEditMode ? existingImages.length : 0);
    const newFiles: File[] = Array.from(files).slice(0, maxNewImages);

    // Create preview URLs for new files
    const newFilePreviewUrls = newFiles.map((file) =>
      URL.createObjectURL(file),
    );

    // If in edit mode, keep existing images and add new ones
    if (isEditMode) {
      // Append new files to existing uploaded files list
      setUploadedImages([...uploadedImages, ...newFiles]);

      // Keep existing image previews and add new ones
      // (Existing image previews should already be in imagePreviewUrls from the product images query)
      setImagePreviewUrls([...imagePreviewUrls, ...newFilePreviewUrls]);
    } else {
      // For new products, just set the uploads directly
      setUploadedImages(newFiles);
      setImagePreviewUrls(newFilePreviewUrls);
    }

    // Update form with first image URL as a placeholder
    const firstImageUrl = imagePreviewUrls[0] || newFilePreviewUrls[0] || "";
    form.setValue("imageUrl", firstImageUrl);
  };

  // Remove image from preview
  const removeImage = (index: number) => {
    // Check if we're in edit mode and if this is an existing image
    if (isEditMode && index < existingImages.length) {
      // Add the image ID to imagesToDelete for server-side deletion on save
      const imageToDelete = existingImages[index];
      setImagesToDelete((prev) => [...prev, imageToDelete.id]);

      // Remove from existing images
      const newExistingImages = [...existingImages];
      newExistingImages.splice(index, 1);
      setExistingImages(newExistingImages);
    } else {
      // This is a newly uploaded image, remove it from uploadedImages
      const adjustedIndex = isEditMode ? index - existingImages.length : index;
      const newImages = [...uploadedImages];
      newImages.splice(adjustedIndex, 1);
      setUploadedImages(newImages);
    }

    // Update preview URLs in both cases
    const newPreviewUrls = [...imagePreviewUrls];

    // Revoke object URL to prevent memory leaks
    if (newPreviewUrls[index] && newPreviewUrls[index].startsWith("blob:")) {
      URL.revokeObjectURL(newPreviewUrls[index]);
    }

    newPreviewUrls.splice(index, 1);
    setImagePreviewUrls(newPreviewUrls);

    // Update form with first remaining image or empty string
    const remainingPreview = newPreviewUrls[0] || "";
    if (isAuctionForm) {
      auctionForm.setValue("imageUrl", remainingPreview);
    } else {
      form.setValue("imageUrl", remainingPreview);
    }
  };

  // Handle image upload for auction form
  const handleAuctionImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // Limit to 5 images total (existing + new)
    const maxNewImages = 5 - (isEditMode ? existingImages.length : 0);
    const newFiles: File[] = Array.from(files).slice(0, maxNewImages);

    // Create preview URLs for new files
    const newFilePreviewUrls = newFiles.map((file) =>
      URL.createObjectURL(file),
    );

    // If in edit mode, keep existing images and add new ones
    if (isEditMode) {
      // Append new files to existing uploaded files list
      setUploadedImages([...uploadedImages, ...newFiles]);

      // Keep existing image previews and add new ones
      // (Existing image previews should already be in imagePreviewUrls from the product images query)
      setImagePreviewUrls([...imagePreviewUrls, ...newFilePreviewUrls]);
    } else {
      // For new products, just set the uploads directly
      setUploadedImages(newFiles);
      setImagePreviewUrls(newFilePreviewUrls);
    }

    // Update auction form with first image URL as a placeholder
    const firstImageUrl = imagePreviewUrls[0] || newFilePreviewUrls[0] || "";
    auctionForm.setValue("imageUrl", firstImageUrl);
  };

  // Create auction mutation
  const createAuctionMutation = useMutation({
    mutationFn: async (data: {
      product: InsertProduct;
      auction: InsertAuction;
    }) => {
      console.log("Starting auction creation process with:", data);

      try {
        // First create the product
        console.log("Creating product with data:", data.product);
        const productRes = await apiRequest(
          "POST",
          "/api/products",
          data.product,
        );
        const product = await productRes.json();
        console.log("Product created successfully:", product);

        // Then create the auction with the product id
        const auctionData = {
          ...data.auction,
          productId: product.id,
        };

        console.log("Creating auction with data:", auctionData);
        console.log("Auction end date format:", auctionData.endsAt);

        const auctionRes = await apiRequest(
          "POST",
          "/api/auctions",
          auctionData,
        );
        console.log("Auction API response status:", auctionRes.status);

        let auctionResult;
        try {
          auctionResult = await auctionRes.json();
          console.log("Auction created successfully:", auctionResult);
        } catch (jsonError) {
          console.error("Error parsing auction response:", jsonError);
          console.log("Raw auction response:", auctionRes);
          auctionResult = { error: "Failed to parse response" };
        }

        return {
          product,
          auction: auctionResult,
        };
      } catch (error) {
        console.error("Error in auction creation process:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Auction created",
        description: "Your auction listing has been created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
      setIsDialogOpen(false);
      auctionForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Error creating auction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update Auction mutation
  const updateAuctionMutation = useMutation({
    mutationFn: async (data: {
      auctionId: number;
      product: any;
      auction: any;
    }) => {
      console.log("Updating auction:", data);
      const res = await apiRequest("PUT", `/api/auctions/${data.auctionId}`, {
        product: data.product,
        auction: data.auction,
        sellerId: user?.id,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Auction updated",
        description: "Your auction has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
      setIsDialogOpen(false);
      setIsEditMode(false);
      setCurrentProductId(null);
      auctionForm.reset();
    },
    onError: (error) => {
      toast({
        title: "Error updating auction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle auction form submission
  const onSubmitAuction = async (data: AuctionFormValues) => {
    // Include sellerId from the logged-in user
    const productData: InsertProduct = {
      name: data.name,
      brand: data.brand,
      description: data.description,
      price: data.startingPrice, // Use starting price as the base price
      imageUrl: data.imageUrl,
      stockQuantity: data.stockQuantity,
      categoryId: data.categoryId,
      isNew: data.isNew,
      isFeatured: data.isFeatured,
      remainingPercentage: data.remainingPercentage,
      batchCode: data.batchCode || undefined,
      purchaseYear: data.purchaseYear,
      boxCondition: data.boxCondition,
      listingType: "auction", // Mark as auction listing
      volume: data.volume,
      sellerId: user?.id || 0,
    };

    // Create auction data with proper type handling
    // Format dates with timezone information for timestamptz
    const endDate =
      data.auctionEndDate instanceof Date
        ? data.auctionEndDate
        : new Date(data.auctionEndDate);

    // Generate ISO string with timezone information
    const endsAtWithTz = endDate.toISOString();

    // Create a start date (now) with timezone information
    const startsAtWithTz = new Date().toISOString();

    const auctionData = {
      productId: 0, // Will be replaced with actual product ID after product creation
      startingPrice: data.startingPrice,
      reservePrice: data.reservePrice,
      buyNowPrice: data.buyNowPrice,
      bidIncrement: data.bidIncrement,
      startsAt: startsAtWithTz, // Add explicit start time with timezone
      endsAt: endsAtWithTz, // Use ISO format with timezone information
      status: "active",
    } as InsertAuction;

    try {
      console.log(auctionData);

      // Check if we're editing an existing auction or creating a new one
      if (isEditMode && currentProductId) {
        console.log("Editing existing auction for product:", currentProductId);

        // First fetch the auction data to get the auction ID
        const response = await fetch(
          `/api/auctions/product/${currentProductId}`,
        );

        if (response.ok) {
          const existingAuction = await response.json();
          console.log("Found existing auction:", existingAuction);

          if (existingAuction && existingAuction.id) {
            // Update both the product and auction
            const result = await updateAuctionMutation.mutateAsync({
              auctionId: existingAuction.id,
              product: {
                ...productData,
                id: currentProductId,
              },
              auction: {
                ...auctionData,
                productId: currentProductId,
              },
            });

            // Process any images marked for deletion
            if (imagesToDelete.length > 0) {
              console.log("Deleting images:", imagesToDelete);

              // Delete each image one by one
              for (const imageId of imagesToDelete) {
                try {
                  await apiRequest(
                    "DELETE",
                    `/api/products/${currentProductId}/images/${imageId}?sellerId=${user?.id || 0}`,
                    null,
                  );
                  console.log(`Successfully deleted image ${imageId}`);
                } catch (error) {
                  console.error(`Failed to delete image ${imageId}:`, error);
                }
              }

              // Clear the deletion list after processing
              setImagesToDelete([]);
            }

            // Upload any new images
            if (uploadedImages.length > 0) {
              await registerImagesMutation.mutateAsync({
                productId: currentProductId,
                images: uploadedImages,
              });
            }
          } else {
            throw new Error("Failed to find auction data for this product");
          }
        } else {
          throw new Error("Failed to fetch auction data for update");
        }
      } else {
        // Create a new product and auction
        const result = await createAuctionMutation.mutateAsync({
          product: productData,
          auction: auctionData,
        });

        // After auction is created, register and upload images
        if (uploadedImages.length > 0) {
          await registerImagesMutation.mutateAsync({
            productId: result.product.id,
            images: uploadedImages,
          });
        }
      }

      // Clear image states
      setUploadedImages([]);
      setImagePreviewUrls([]);
      setExistingImages([]);
      setImagesToDelete([]);

      // Close dialog after successful submission
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error in auction submission:", error);
      toast({
        title: isEditMode ? "Error updating auction" : "Error creating auction",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Select listing type and show appropriate form
  const onSelectListingType = (data: ListingTypeFormValues) => {
    setSelectedListingType(data.listingType);
    setIsAuctionForm(data.listingType === "auction");
    setIsTypeSelectionOpen(false);

    // Reset the appropriate form
    if (data.listingType === "auction") {
      auctionForm.reset();
    } else {
      form.reset({
        name: "",
        brand: "",
        description: "",
        price: 0,
        imageUrl: "",
        stockQuantity: 0,
        categoryId: 0,
        isNew: false,
        isFeatured: false,
        remainingPercentage: 100,
        batchCode: "",
        purchaseYear: new Date().getFullYear(),
        boxCondition: "Good",
        listingType: "fixed",
        volume: 100,
      });
    }

    // Clear image states
    setUploadedImages([]);
    setImagePreviewUrls([]);

    // Open the product form dialog
    setIsDialogOpen(true);
  };

  // Open dialog for new product (now opens listing type selection first)
  const handleAddNewProduct = () => {
    setIsEditMode(false);
    setCurrentProductId(null);
    setIsTypeSelectionOpen(true);

    // Reset listing type selection form
    listingTypeForm.reset({
      listingType: "fixed",
    });
  };

  // Filter products by search query
  const filteredProducts = products?.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.brand.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Sort products by status priority: featured -> active -> pending -> sold
  const sortedProducts = filteredProducts?.sort((a, b) => {
    const getStatusPriority = (product: ProductWithDetails) => {
      const status = product.status?.toLowerCase() || "active";
      switch (status) {
        case "featured":
          return 4; // Highest priority
        case "active":
          return 3;
        case "pending":
          return 2;
        case "sold":
          return 1;
        case "archived":
          return 0;
        default:
          return 3; // Default to active priority
      }
    };

    const priorityA = getStatusPriority(a);
    const priorityB = getStatusPriority(b);

    // Sort by priority descending, then by creation date descending
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }

    // If same priority, sort by creation date (newest first)
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  // Track boosted products based on database featured status fields
  useEffect(() => {
    if (products) {
      const nowDate = new Date();
      console.log(
        "Checking featured products status. Total products:",
        products.length,
      );

      // Comprehensive check for all possible featured flags and dates
      // This ensures compatibility with both database field names and code field names
      const featuredProducts = products.filter((p) => {
        // Check all possible "featured" flags
        const isFeaturedByFlag =
          p.is_featured === true || p.isFeatured === true;

        // Check all possible "featured until" dates
        const now = new Date();
        const hasFutureDate =
          (p.featured_until && new Date(p.featured_until) > now) ||
          (p.featuredUntil && new Date(p.featuredUntil) > now);

        // Product is featured if either the flag is true or the date is valid
        return isFeaturedByFlag || hasFutureDate;
      });

      const allBoostedIds = featuredProducts.map((p) => p.id);

      // Log information about boost packages and groups for debugging
      const packageInfo = featuredProducts.map((p) => {
        let boostType = "Standard";

        // Determine boost type based on package ID
        if (p.boost_package_id || p.boostPackageId) {
          const packageId = p.boost_package_id || p.boostPackageId || 0;
          // Package IDs 5-8 are Premium packages based on our package structure
          boostType = packageId >= 5 ? "Premium" : "Standard";
        }

        return {
          id: p.id,
          name: p.name,
          is_featured: p.is_featured,
          isFeatured: p.isFeatured,
          featured_until: p.featured_until,
          featuredUntil: p.featuredUntil,
          boost_package_id: p.boost_package_id,
          boostPackageId: p.boostPackageId,
          boost_group_id: p.boost_group_id,
          boostGroupId: p.boostGroupId,
          boostType: boostType,
        };
      });

      console.log("Found featured products with package info:", packageInfo);

      console.log("Final list of featured product IDs:", allBoostedIds);
      setBoostedProductIds(allBoostedIds);
    }
  }, [products]);

  // Handle boost checkbox changes
  const toggleBoostProduct = (productId: number) => {
    setBoostedProducts((prev) => {
      if (prev.includes(productId)) {
        // Remove product from boosted list
        return prev.filter((id) => id !== productId);
      } else {
        // Add product to boosted list
        return [...prev, productId];
      }
    });
  };

  // Query to fetch boost packages
  const { data: boostPackages } = useQuery({
    queryKey: ["/api/boost/packages"],
    queryFn: async () => {
      const response = await fetch("/api/boost/packages");
      if (!response.ok) throw new Error("Failed to fetch boost packages");
      return response.json();
    },
  });

  // Open boost dialog to select boost packages
  const openBoostDialog = () => {
    if (boostedProducts.length === 0) {
      toast({
        title: "No products selected",
        description: "Please select at least one product to boost",
        variant: "destructive",
      });
      return;
    }

    setIsBoostDialogOpen(true);
  };

  // Handle boost checkout with package selection
  const handleBoostCheckout = async (selectedPackageId: number) => {
    if (boostedProducts.length === 0) {
      toast({
        title: "No products selected",
        description: "Please select at least one product to boost",
        variant: "destructive",
      });
      return;
    }

    // Find the selected package
    const selectedPackage = boostPackages?.find(
      (pkg: any) => pkg.id === selectedPackageId,
    );
    if (!selectedPackage) {
      toast({
        title: "Invalid package",
        description: "Please select a valid boost package",
        variant: "destructive",
      });
      return;
    }

    // Validate product count matches package
    if (boostedProducts.length !== selectedPackage.item_count) {
      toast({
        title: "Product count mismatch",
        description: `This package requires exactly ${selectedPackage.item_count} products. You have selected ${boostedProducts.length}.`,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Processing your request",
      description: "Please wait while we prepare your payment...",
    });

    try {
      // Create boost order using the modern package system
      const response = await fetch("/api/boost/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          boostPackageId: selectedPackageId,
          productIds: boostedProducts,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create boost order");
      }

      const orderData = await response.json();

      // Close the dialog
      setIsBoostDialogOpen(false);

      // Clear selected products
      setBoostedProducts([]);

      // Redirect to payment page
      if (orderData.paymentUrl) {
        window.location.href = orderData.paymentUrl;
      } else {
        toast({
          title: "Error",
          description: "Payment URL not received",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Boost order error:", error);
      toast({
        title: "Boost Order Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create boost order",
        variant: "destructive",
      });
    }
  };

  // Calculate dashboard statistics
  const totalProducts = products?.length || 0;
  const totalStock =
    products?.reduce((sum, product) => sum + product.stockQuantity, 0) || 0;
  const averagePrice = products?.length
    ? products.reduce((sum, product) => sum + product.price, 0) /
      products.length
    : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-grow bg-gray-50">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
            <div>
              <h1 className="font-playfair text-3xl font-bold mb-2">
                Seller Dashboard
              </h1>
              <p className="text-gray-600">
                Manage your perfume products and view insights
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setLocation("/boost-checkout")}
                className="mt-4 md:mt-0 bg-purple-600 hover:bg-purple-700 text-white flex items-center"
              >
                <Star className="mr-2 h-4 w-4" />
                Boost Products
              </Button>
              <Button
                onClick={handleAddNewProduct}
                className="mt-4 md:mt-0 bg-gold text-rich-black hover:bg-metallic-gold flex items-center"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add New Product
              </Button>
            </div>
          </div>

          {/* Dashboard summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="bg-gold/20 p-3 rounded-full mr-4">
                    <Package className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Products</p>
                    <h3 className="text-2xl font-bold">{totalProducts}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="bg-gold/20 p-3 rounded-full mr-4">
                    <ShoppingBag className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Inventory</p>
                    <h3 className="text-2xl font-bold">{totalStock} units</h3>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <div className="bg-gold/20 p-3 rounded-full mr-4">
                    <DollarSign className="h-6 w-6 text-gold" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Average Price</p>
                    <h3 className="text-2xl font-bold">
                      RM{averagePrice.toFixed(2)}
                    </h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="boosted" className="relative">
                Boosted Products
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-[10px] text-white">
                  {boostedProductIds.length}
                </span>
              </TabsTrigger>
              {/* <TabsTrigger value="analytics">Analytics</TabsTrigger> */}
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between md:items-center">
                    <div>
                      <CardTitle>Your Products</CardTitle>
                      <CardDescription>
                        Manage your perfume products inventory
                      </CardDescription>
                    </div>
                    <div className="relative mt-4 md:mt-0">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search products..."
                        className="pl-10 w-full md:w-64"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingProducts ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-gold" />
                    </div>
                  ) : sortedProducts && sortedProducts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="bg-[#FFF9E6]">
                              <div className="flex items-center">
                                Boost
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded bg-[#FF9800] text-white">
                                  NEW
                                </span>
                              </div>
                            </TableHead>
                            <TableHead>Image</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Stock</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedProducts.map((product) => (
                            <TableRow
                              key={product.id}
                              className={
                                boostedProductIds.includes(product.id)
                                  ? "bg-[#FFF9E6]"
                                  : ""
                              }
                            >
                              <TableCell className="bg-[#FFF9E6]">
                                {boostedProductIds.includes(product.id) ? (
                                  <div className="flex items-center justify-center">
                                    <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs font-semibold rounded">
                                      Boosted
                                    </span>
                                  </div>
                                ) : (
                                  <Checkbox
                                    id={`boost-${product.id}`}
                                    checked={boostedProducts.includes(
                                      product.id,
                                    )}
                                    onCheckedChange={() =>
                                      toggleBoostProduct(product.id)
                                    }
                                    className="h-5 w-5 border-2 border-[#F5A623] data-[state=checked]:bg-[#F5A623] data-[state=checked]:text-white rounded-sm focus:ring-0 animate-pulse transition-all duration-300 ease-in-out"
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="w-10 h-10 rounded overflow-hidden bg-gray-100">
                                  <img
                                    src={
                                      // First, try to find an image with imageOrder=0
                                      product.images &&
                                      product.images.find(
                                        (img) => img.imageOrder === 0,
                                      )
                                        ? `/api/images/${product.images.find((img) => img.imageOrder === 0)?.imageUrl}`
                                        : // Then try any available image
                                          product.images &&
                                            product.images.length > 0
                                          ? `/api/images/${product.images[0].imageUrl}`
                                          : // Default placeholder if no images are available
                                            "/placeholder.jpg"
                                    }
                                    alt={product.name}
                                    onError={(e) => {
                                      // If image fails to load, use placeholder
                                      (e.target as HTMLImageElement).src =
                                        "/placeholder.jpg";
                                    }}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">
                                {product.name}
                              </TableCell>
                              <TableCell>{product.brand}</TableCell>
                              <TableCell>
                                {product.category?.name || "Uncategorized"}
                              </TableCell>
                              <TableCell>
                                RM{product.price.toFixed(2)}
                              </TableCell>
                              <TableCell>{product.stockQuantity}</TableCell>
                              <TableCell>
                                {product.status
                                  ? product.status.charAt(0).toUpperCase() +
                                    product.status.slice(1)
                                  : "Active"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end space-x-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => handleEditProduct(product)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() =>
                                      handleDeleteProduct(product.id)
                                    }
                                    disabled={isDeleting === product.id}
                                  >
                                    {isDeleting === product.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Total Price Summary for Boosted Products */}
                      {boostedProducts.length > 0 && (
                        <div className="mt-4 p-4 bg-[#FFF9E6] border border-[#F5A623] rounded-md">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-medium text-gray-700">
                                Total Boost Cost:
                              </span>
                              <span className="ml-2 font-bold text-lg">
                                RM{(boostedProducts.length * 10).toFixed(2)}
                              </span>
                              <span className="ml-2 text-sm text-gray-500">
                                ({boostedProducts.length} products × RM10.00)
                              </span>
                            </div>
                            {/* <Button
                              onClick={handleBoostCheckout}
                              className="bg-[#F5A623] hover:bg-[#E59400] text-white"
                            >
                              Boost Now
                            </Button> */}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium mb-2">
                        No products found
                      </h3>
                      <p className="text-gray-500 mb-6">
                        {searchQuery
                          ? "No products match your search criteria"
                          : "You haven't added any products yet"}
                      </p>
                      {searchQuery ? (
                        <Button
                          variant="outline"
                          onClick={() => setSearchQuery("")}
                        >
                          Clear Search
                        </Button>
                      ) : (
                        <Button
                          className="bg-gold text-rich-black hover:bg-metallic-gold"
                          onClick={handleAddNewProduct}
                        >
                          Add Your First Product
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics">
              <Card>
                <CardHeader>
                  <CardTitle>Analytics & Insights</CardTitle>
                  <CardDescription>
                    View performance metrics for your products
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-lg border p-6">
                      <h3 className="text-lg font-medium mb-4">
                        Top Rated Products
                      </h3>

                      {products && products.length > 0 ? (
                        <div className="space-y-4">
                          {products
                            .filter((p) => p.averageRating)
                            .sort(
                              (a, b) =>
                                (b.averageRating || 0) - (a.averageRating || 0),
                            )
                            .slice(0, 3)
                            .map((product) => (
                              <div
                                key={product.id}
                                className="flex items-center"
                              >
                                <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 mr-3">
                                  <img
                                    src={
                                      // First, try to find an image with imageOrder=0
                                      product.images &&
                                      product.images.find(
                                        (img) => img.imageOrder === 0,
                                      )
                                        ? `/api/images/${product.images.find((img) => img.imageOrder === 0)?.imageUrl}`
                                        : // Then try any available image
                                          product.images &&
                                            product.images.length > 0
                                          ? `/api/images/${product.images[0].imageUrl}`
                                          : // Default placeholder if no images are available
                                            "/placeholder.jpg"
                                    }
                                    alt={product.name}
                                    onError={(e) => {
                                      // If image fails to load, use placeholder
                                      (e.target as HTMLImageElement).src =
                                        "/placeholder.jpg";
                                    }}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="flex-grow">
                                  <div className="font-medium">
                                    {product.name}
                                  </div>
                                  <div className="flex items-center">
                                    <div className="flex text-gold">
                                      {[...Array(5)].map((_, i) => (
                                        <Star
                                          key={i}
                                          className={`h-3 w-3 ${i < Math.floor(product.averageRating || 0) ? "fill-gold" : ""}`}
                                        />
                                      ))}
                                    </div>
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({product.reviews?.length || 0})
                                    </span>
                                  </div>
                                </div>
                                <div className="font-semibold">
                                  ${product.price.toFixed(2)}
                                </div>
                              </div>
                            ))}

                          {!products.some((p) => p.averageRating) && (
                            <p className="text-gray-500">
                              No rated products yet
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-500">
                          No product data available
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border p-6">
                      <h3 className="text-lg font-medium mb-4">
                        Inventory Status
                      </h3>

                      {products && products.length > 0 ? (
                        <div>
                          <div className="mb-6">
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">
                                Low Stock (≤ 5 units)
                              </span>
                              <span className="text-sm font-medium">
                                {
                                  products.filter((p) => p.stockQuantity <= 5)
                                    .length
                                }{" "}
                                products
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-red-500 h-2 rounded-full"
                                style={{
                                  width: `${(products.filter((p) => p.stockQuantity <= 5).length / products.length) * 100}%`,
                                }}
                              ></div>
                            </div>
                          </div>

                          <div className="mb-6">
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">
                                Medium Stock (6-20 units)
                              </span>
                              <span className="text-sm font-medium">
                                {
                                  products.filter(
                                    (p) =>
                                      p.stockQuantity > 5 &&
                                      p.stockQuantity <= 20,
                                  ).length
                                }{" "}
                                products
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-yellow-500 h-2 rounded-full"
                                style={{
                                  width: `${(products.filter((p) => p.stockQuantity > 5 && p.stockQuantity <= 20).length / products.length) * 100}%`,
                                }}
                              ></div>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">
                                Good Stock ({">"} 20 units)
                              </span>
                              <span className="text-sm font-medium">
                                {
                                  products.filter((p) => p.stockQuantity > 20)
                                    .length
                                }{" "}
                                products
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{
                                  width: `${(products.filter((p) => p.stockQuantity > 20).length / products.length) * 100}%`,
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500">
                          No inventory data available
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="boosted">
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between md:items-center">
                    <div>
                      <CardTitle className="flex items-center">
                        <Star className="h-5 w-5 text-purple-600 mr-2" />
                        Boosted Products
                      </CardTitle>
                      <CardDescription>
                        Manage your featured product campaigns
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => setLocation("/boost-checkout")}
                      className="mt-4 md:mt-0 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Boost More Products
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingProducts ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                    </div>
                  ) : boostedProductIds.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-purple-50">
                            <TableHead>Image</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Boost Type</TableHead>
                            <TableHead>Boosted Until</TableHead>
                            <TableHead>Time Remaining</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProducts
                            ?.filter((p) => boostedProductIds.includes(p.id))
                            .map((product) => {
                              const featuredUntil =
                                product.featured_until || product.featuredUntil;
                              const featuredUntilDate = featuredUntil
                                ? new Date(featuredUntil)
                                : null;
                              const now = new Date();
                              const timeRemaining = featuredUntilDate
                                ? Math.max(
                                    0,
                                    Math.floor(
                                      (featuredUntilDate.getTime() -
                                        now.getTime()) /
                                        (1000 * 60 * 60),
                                    ),
                                  )
                                : 0;

                              // Determine boost type based on package ID - Premium packages have IDs 5-8
                              const packageId =
                                product.boost_package_id ||
                                product.boostPackageId ||
                                0;
                              const boostType =
                                packageId >= 5 ? "Premium" : "Standard";

                              return (
                                <TableRow
                                  key={product.id}
                                  className="bg-purple-50/30"
                                >
                                  <TableCell>
                                    {product.images &&
                                    product.images[0]?.imageUrl ? (
                                      <img
                                        src={`/api/images/${product.images[0].imageUrl}`}
                                        alt={product.name}
                                        className="h-12 w-12 object-cover rounded-md"
                                      />
                                    ) : product.imageUrl ? (
                                      <img
                                        src={`/api/images/${product.imageUrl}`}
                                        alt={product.name}
                                        className="h-12 w-12 object-cover rounded-md"
                                      />
                                    ) : (
                                      <div className="h-12 w-12 bg-gray-200 rounded-md flex items-center justify-center">
                                        <Package className="h-6 w-6 text-gray-400" />
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {product.name}
                                  </TableCell>
                                  <TableCell>
                                    RM{(product.price / 100).toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="outline"
                                      className={`${boostType === "Premium" ? "border-purple-500 text-purple-700 bg-purple-50" : "border-amber-500 text-amber-700 bg-amber-50"}`}
                                    >
                                      {boostType} Boost
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {featuredUntilDate
                                      ? formatDateTimeNice(featuredUntilDate)
                                      : "N/A"}
                                  </TableCell>
                                  <TableCell>
                                    {timeRemaining > 0 ? (
                                      <div className="flex items-center">
                                        <Timer className="h-4 w-4 mr-1 text-green-600" />
                                        <span>{timeRemaining} hours left</span>
                                      </div>
                                    ) : (
                                      <span className="text-red-500">
                                        Expired
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setLocation("/boost-checkout")
                                      }
                                      className="h-8"
                                    >
                                      Renew Boost
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100">
                        <Star className="h-6 w-6 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-medium mb-2">
                        No Boosted Products
                      </h3>
                      <p className="text-muted-foreground max-w-md mx-auto mb-6">
                        Boost your products to increase visibility and sales.
                        Featured products appear at the top of search results
                        and on the homepage.
                      </p>
                      <Button
                        onClick={() => setLocation("/boost-checkout")}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        Get Started with Boost
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle>Seller Account Settings</CardTitle>
                  <CardDescription>
                    Manage your seller profile and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        Account Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="account-name">Name</Label>
                          <Input
                            id="account-name"
                            value={`${user?.firstName || ""} ${user?.lastName || ""}`}
                            disabled
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="account-email">Email</Label>
                          <Input
                            id="account-email"
                            value={user?.email || ""}
                            disabled
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="account-username">Username</Label>
                          <Input
                            id="account-username"
                            value={user?.username || ""}
                            disabled
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="account-role">Account Type</Label>
                          <Input
                            id="account-role"
                            value="Seller"
                            disabled
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        Notification Preferences
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="notify-sales">
                            Sales notifications
                          </Label>
                          <Checkbox id="notify-sales" checked />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="notify-reviews">
                            New review notifications
                          </Label>
                          <Checkbox id="notify-reviews" checked />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="notify-stock">Low stock alerts</Label>
                          <Checkbox id="notify-stock" checked />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="bg-gold text-rich-black hover:bg-metallic-gold">
                    Save Changes
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Listing Type Selection Dialog */}
      <Dialog open={isTypeSelectionOpen} onOpenChange={setIsTypeSelectionOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Listing Type</DialogTitle>
            <DialogDescription>
              Choose how you want to list your perfume product
            </DialogDescription>
          </DialogHeader>

          <Form {...listingTypeForm}>
            <form
              onSubmit={listingTypeForm.handleSubmit(onSelectListingType)}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col space-y-4">
                  {/* Fixed Price Option */}
                  <FormField
                    control={listingTypeForm.control}
                    name="listingType"
                    render={({ field }) => (
                      <div className="space-y-4">
                        <div
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            field.value === "fixed"
                              ? "border-gold bg-gold/10 text-black"
                              : "border-gray-200 hover:border-gold/50 text-gray-800"
                          }`}
                          onClick={() => field.onChange("fixed")}
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <input
                                type="radio"
                                checked={field.value === "fixed"}
                                onChange={() => field.onChange("fixed")}
                                className="h-5 w-5 text-gold cursor-pointer accent-gold"
                                id="fixed-price-option"
                              />
                            </FormControl>
                            <div className="flex-1">
                              <FormLabel
                                htmlFor="fixed-price-option"
                                className="font-medium cursor-pointer flex items-center text-base"
                              >
                                <Tag className="mr-2 h-5 w-5" />
                                Fixed Price
                              </FormLabel>
                              <p className="text-sm text-gray-600 mt-1">
                                Set a specific price for immediate purchase
                              </p>
                            </div>
                          </FormItem>
                        </div>

                        {/* Auction Option */}
                        <div
                          className={`border rounded-lg p-4 cursor-pointer transition-all ${
                            field.value === "auction"
                              ? "border-gold bg-gold/10 text-black"
                              : "border-gray-200 hover:border-gold/50 text-gray-800"
                          }`}
                          onClick={() => field.onChange("auction")}
                        >
                          <FormItem className="flex items-center space-x-3 space-y-0">
                            <FormControl>
                              <input
                                type="radio"
                                checked={field.value === "auction"}
                                onChange={() => field.onChange("auction")}
                                className="h-5 w-5 text-gold cursor-pointer accent-gold"
                                id="auction-option"
                              />
                            </FormControl>
                            <div className="flex-1">
                              <FormLabel
                                htmlFor="auction-option"
                                className="font-medium cursor-pointer flex items-center text-base"
                              >
                                <Timer className="mr-2 h-5 w-5" />
                                Auction
                              </FormLabel>
                              <p className="text-sm text-gray-600 mt-1">
                                Allow buyers to bid, potentially increasing
                                final price
                              </p>
                            </div>
                          </FormItem>
                        </div>
                      </div>
                    )}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTypeSelectionOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-gold text-rich-black hover:bg-metallic-gold"
                >
                  Continue
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Product Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode
                ? "Edit Product"
                : isAuctionForm
                  ? "Create Auction Listing"
                  : "Add Fixed Price Listing"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update your product information below"
                : isAuctionForm
                  ? "Set up your auction listing details below"
                  : "Fill in the details to add a new perfume product"}
            </DialogDescription>
          </DialogHeader>

          {isAuctionForm ? (
            // Auction form
            <Form {...auctionForm}>
              <form
                onSubmit={auctionForm.handleSubmit(onSubmitAuction)}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={auctionForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Midnight Rose" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={auctionForm.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Chanel" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={auctionForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your product..."
                          className="min-h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={auctionForm.control}
                    name="startingPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Starting Price (MYR)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="99.99"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={auctionForm.control}
                    name="reservePrice"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-primary text-xs font-semibold cursor-help">
                                  i
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  The minimum price you are willing to accept
                                  for this item. If the auction ends without
                                  meeting this price, it will be marked as
                                  "reserve not met" and you'll be notified.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <FormLabel>Reserve Price (Optional)</FormLabel>
                        </div>
                        <FormControl>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="Minimum acceptable price"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => {
                              const value =
                                e.target.value === ""
                                  ? undefined
                                  : parseFloat(e.target.value);
                              field.onChange(value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={auctionForm.control}
                    name="buyNowPrice"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel>Buy Now Price (Optional)</FormLabel>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-primary text-xs font-semibold cursor-help">
                                  i
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  The price at which a buyer can immediately
                                  purchase this item and end the auction.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <FormControl>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="Immediate purchase price"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => {
                              const value =
                                e.target.value === ""
                                  ? undefined
                                  : parseFloat(e.target.value);
                              field.onChange(value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={auctionForm.control}
                    name="bidIncrement"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bid Increment (MYR)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0.10"
                            step="0.10"
                            placeholder="0.10"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={auctionForm.control}
                  name="auctionEndDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">
                        Auction End Date (Your Local Time)
                      </FormLabel>
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2">
                          {/* Date selectors */}
                          <div>
                            <FormLabel className="text-xs">Day</FormLabel>
                            <Select
                              value={
                                field.value instanceof Date
                                  ? String(field.value.getDate())
                                  : "1"
                              }
                              onValueChange={(value) => {
                                const newDate =
                                  field.value instanceof Date
                                    ? new Date(field.value)
                                    : new Date();
                                newDate.setDate(parseInt(value));
                                field.onChange(newDate);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Day" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from(
                                  { length: 31 },
                                  (_, i) => i + 1,
                                ).map((day) => (
                                  <SelectItem key={day} value={String(day)}>
                                    {String(day).padStart(2, "0")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <FormLabel className="text-xs">Month</FormLabel>
                            <Select
                              value={
                                field.value instanceof Date
                                  ? String(field.value.getMonth())
                                  : "0"
                              }
                              onValueChange={(value) => {
                                const newDate =
                                  field.value instanceof Date
                                    ? new Date(field.value)
                                    : new Date();
                                newDate.setMonth(parseInt(value));
                                field.onChange(newDate);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Month" />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  "Jan",
                                  "Feb",
                                  "Mar",
                                  "Apr",
                                  "May",
                                  "Jun",
                                  "Jul",
                                  "Aug",
                                  "Sep",
                                  "Oct",
                                  "Nov",
                                  "Dec",
                                ].map((month, index) => (
                                  <SelectItem key={index} value={String(index)}>
                                    {month}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <FormLabel className="text-xs">Year</FormLabel>
                            <Select
                              value={
                                field.value instanceof Date
                                  ? String(field.value.getFullYear())
                                  : String(new Date().getFullYear())
                              }
                              onValueChange={(value) => {
                                const newDate =
                                  field.value instanceof Date
                                    ? new Date(field.value)
                                    : new Date();
                                newDate.setFullYear(parseInt(value));
                                field.onChange(newDate);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Year" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from(
                                  { length: 5 },
                                  (_, i) => new Date().getFullYear() + i,
                                ).map((year) => (
                                  <SelectItem key={year} value={String(year)}>
                                    {year}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Time selectors */}
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <FormLabel className="text-xs">
                              Hour (24h)
                            </FormLabel>
                            <Select
                              value={
                                field.value instanceof Date
                                  ? String(field.value.getHours())
                                  : "12"
                              }
                              onValueChange={(value) => {
                                const newDate =
                                  field.value instanceof Date
                                    ? new Date(field.value)
                                    : new Date();
                                newDate.setHours(parseInt(value));
                                field.onChange(newDate);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Hour" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 24 }, (_, i) => i).map(
                                  (hour) => (
                                    <SelectItem key={hour} value={String(hour)}>
                                      {String(hour).padStart(2, "0")}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <FormLabel className="text-xs">Minute</FormLabel>
                            <Select
                              value={
                                field.value instanceof Date
                                  ? String(field.value.getMinutes())
                                  : "0"
                              }
                              onValueChange={(value) => {
                                const newDate =
                                  field.value instanceof Date
                                    ? new Date(field.value)
                                    : new Date();
                                newDate.setMinutes(parseInt(value));
                                field.onChange(newDate);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Min" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 60 }, (_, i) => i).map(
                                  (min) => (
                                    <SelectItem key={min} value={String(min)}>
                                      {String(min).padStart(2, "0")}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <FormLabel className="text-xs">Second</FormLabel>
                            <Select
                              value={
                                field.value instanceof Date
                                  ? String(field.value.getSeconds())
                                  : "0"
                              }
                              onValueChange={(value) => {
                                const newDate =
                                  field.value instanceof Date
                                    ? new Date(field.value)
                                    : new Date();
                                newDate.setSeconds(parseInt(value));
                                field.onChange(newDate);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Sec" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 60 }, (_, i) => i).map(
                                  (sec) => (
                                    <SelectItem key={sec} value={String(sec)}>
                                      {String(sec).padStart(2, "0")}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="text-sm text-muted-foreground">
                          <Clock className="inline-block mr-1 h-4 w-4" />{" "}
                          Current timezone:{" "}
                          {Intl.DateTimeFormat().resolvedOptions().timeZone}
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={auctionForm.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        onValueChange={(value) =>
                          field.onChange(parseInt(value))
                        }
                        value={field.value ? field.value.toString() : undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories?.map((category) => (
                            <SelectItem
                              key={category.id}
                              value={category.id.toString()}
                            >
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={auctionForm.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Images (up to 5)</FormLabel>
                      <div className="flex flex-col gap-2">
                        {/* Authenticity Alert */}
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                          <div className="flex items-start space-x-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-amber-800">
                                Important: Use Only Your Own Photos
                              </p>
                              <p className="text-xs text-amber-700 mt-1">
                                Please upload authentic pictures of the actual perfume from your personal collection. Using photos from the internet or other sources is not allowed and may result in listing removal.
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="border rounded-md p-4 bg-gray-50">
                          <div className="flex items-center justify-center w-full">
                            <label
                              htmlFor="auction-images"
                              className="cursor-pointer w-full"
                            >
                              <div className="flex flex-col items-center justify-center py-4 border-2 border-dashed rounded-md border-gray-300 hover:border-gold transition-colors">
                                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                                <p className="text-sm text-gray-500">
                                  Click to upload images
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  JPG, PNG, or GIF up to 5MB
                                </p>
                              </div>
                              <input
                                id="auction-images"
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleAuctionImageUpload(e)}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Preview area for uploaded images */}
                        {imagePreviewUrls.length > 0 && (
                          <div className="grid grid-cols-5 gap-2 mt-3">
                            {imagePreviewUrls.map((url, index) => (
                              <div key={index} className="relative group">
                                <img
                                  src={url}
                                  alt={`Preview ${index + 1}`}
                                  className="w-full h-16 object-cover rounded-md border border-gray-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImage(index)}
                                  className="absolute top-1 right-1 bg-white/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3 text-gray-600" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Note about editing and reuploading images */}
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                          <p className="text-xs text-blue-700">
                            📝 <strong>Note:</strong> If your images don't show
                            up properly on the homepage, please edit and
                            reupload your pictures for the listings.
                          </p>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-wrap gap-4">
                  <FormField
                    control={auctionForm.control}
                    name="isNew"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="m-0">Mark as New</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Secondhand perfume specific fields */}
                <h3 className="text-lg font-medium mt-8 mb-4">
                  Perfume Condition Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={auctionForm.control}
                    name="volume"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bottle Size (ml)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="100"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={auctionForm.control}
                    name="remainingPercentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bottle Fullness (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            placeholder="100"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={auctionForm.control}
                    name="purchaseYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Year</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1970}
                            max={new Date().getFullYear()}
                            placeholder={new Date().getFullYear().toString()}
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                parseInt(e.target.value) ||
                                  new Date().getFullYear(),
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={auctionForm.control}
                    name="boxCondition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Box Condition</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select box condition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Good">Good</SelectItem>
                            <SelectItem value="Damaged">Damaged</SelectItem>
                            <SelectItem value="No Box">No Box</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={auctionForm.control}
                    name="batchCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Batch Code (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., 8K01"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-gold text-rich-black hover:bg-metallic-gold"
                    disabled={
                      createAuctionMutation.isPending ||
                      updateAuctionMutation.isPending
                    }
                  >
                    {createAuctionMutation.isPending ||
                    updateAuctionMutation.isPending ? (
                      <span className="flex items-center">
                        <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                        {isEditMode ? "Updating..." : "Creating..."}
                      </span>
                    ) : isEditMode ? (
                      "Update Auction"
                    ) : (
                      "Create Auction"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          ) : (
            // Fixed price product form
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmitProduct)}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Midnight Rose" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Chanel" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your product..."
                          className="min-h-24"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price (MYR)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="99.99"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="stockQuantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stock Quantity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="1"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(parseInt(value))
                          }
                          value={
                            field.value ? field.value.toString() : undefined
                          }
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories?.map((category) => (
                              <SelectItem
                                key={category.id}
                                value={category.id.toString()}
                              >
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Images (up to 5)</FormLabel>
                      <div className="flex flex-col gap-2">
                        {/* Authenticity Alert */}
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                          <div className="flex items-start space-x-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-amber-800">
                                Important: Use Only Your Own Photos
                              </p>
                              <p className="text-xs text-amber-700 mt-1">
                                Please upload authentic pictures of the actual perfume from your personal collection. Using photos from the internet or other sources is not allowed and may result in listing removal.
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="border rounded-md p-4 bg-gray-50">
                          <div className="flex items-center justify-center w-full">
                            <label
                              htmlFor="product-images"
                              className="cursor-pointer w-full"
                            >
                              <div className="flex flex-col items-center justify-center py-4 border-2 border-dashed rounded-md border-gray-300 hover:border-gold transition-colors">
                                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                                <p className="text-sm text-gray-500">
                                  Click to upload images
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  JPG, PNG, or GIF up to 5MB
                                </p>
                              </div>
                              <input
                                id="product-images"
                                type="file"
                                multiple
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleImageUpload(e)}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Preview area for uploaded images */}
                        {imagePreviewUrls.length > 0 && (
                          <div className="grid grid-cols-5 gap-2 mt-3">
                            {imagePreviewUrls.map((url, index) => (
                              <div key={index} className="relative group">
                                <img
                                  src={url}
                                  alt={`Preview ${index + 1}`}
                                  className="w-full h-16 object-cover rounded-md border border-gray-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImage(index)}
                                  className="absolute top-1 right-1 bg-white/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3 text-gray-600" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Note about editing and reuploading images */}
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                          <p className="text-xs text-blue-700">
                            📝 <strong>Note:</strong> If your images don't show
                            up properly on the homepage, please edit and
                            reupload your pictures for the listings.
                          </p>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-wrap gap-4">
                  <FormField
                    control={form.control}
                    name="isNew"
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="m-0">Mark as New</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Secondhand perfume specific fields */}
                <h3 className="text-lg font-medium mt-8 mb-4">
                  Perfume Condition Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="volume"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bottle Size (ml)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="100"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="remainingPercentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bottle Fullness (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            placeholder="100"
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="purchaseYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Year</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1970}
                            max={new Date().getFullYear()}
                            placeholder={new Date().getFullYear().toString()}
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                parseInt(e.target.value) ||
                                  new Date().getFullYear(),
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="boxCondition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Box Condition</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select box condition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Good">Good</SelectItem>
                            <SelectItem value="Damaged">Damaged</SelectItem>
                            <SelectItem value="No Box">No Box</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="batchCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Batch Code (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 8K01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="listingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Listing Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select listing type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed Price</SelectItem>
                            <SelectItem value="negotiable">
                              Negotiable
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-gold text-rich-black hover:bg-metallic-gold"
                    disabled={
                      createProductMutation.isPending ||
                      updateProductMutation.isPending
                    }
                  >
                    {createProductMutation.isPending ||
                    updateProductMutation.isPending ? (
                      <span className="flex items-center">
                        <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                        {isEditMode ? "Updating..." : "Creating..."}
                      </span>
                    ) : isEditMode ? (
                      "Update Product"
                    ) : (
                      "Create Product"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating action button for boosting products */}
      {boostedProducts.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 animate-fadeIn">
          <Button
            onClick={openBoostDialog}
            className="bg-gradient-to-r from-gold to-metallic-gold text-rich-black hover:from-metallic-gold hover:to-gold shadow-lg px-6 py-6 rounded-full flex items-center space-x-2 transition-all duration-300 ease-in-out"
          >
            <span className="font-semibold">
              Boost Selected ({boostedProducts.length})
            </span>
            <span className="mx-2 text-xs bg-white/20 px-2 py-1 rounded">
              Select boost options
            </span>
            <span className="flex items-center">Continue →</span>
          </Button>
        </div>
      )}

      {/* Boost Packages Dialog */}
      <Dialog open={isBoostDialogOpen} onOpenChange={setIsBoostDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Boost Your Products</DialogTitle>
            <DialogDescription>
              Select a boost package that matches your selected product count.
              Boosted products appear at the top of search results.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {/* Product count summary */}
            <div className="flex items-center mb-6 p-3 bg-slate-50 rounded-md border">
              <Package className="h-5 w-5 text-slate-600 mr-3" />
              <div>
                <span className="font-medium">
                  {boostedProducts.length}{" "}
                  {boostedProducts.length === 1 ? "product" : "products"}{" "}
                  selected
                </span>
                <p className="text-sm text-muted-foreground">
                  Choose a package that matches your product count
                </p>
              </div>
            </div>

            {/* Package Selection Grid */}
            {boostPackages && boostPackages.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {boostPackages
                  .filter(
                    (pkg: any) => pkg.item_count === boostedProducts.length,
                  )
                  .map((pkg: any) => (
                    <Card
                      key={pkg.id}
                      className="cursor-pointer hover:border-[#F5A623] transition-colors"
                      onClick={() => handleBoostCheckout(pkg.id)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{pkg.name}</CardTitle>
                          <Badge
                            variant={
                              pkg.package_type === "premium"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {pkg.package_type}
                          </Badge>
                        </div>
                        <CardDescription>
                          {pkg.item_count}{" "}
                          {pkg.item_count === 1 ? "product" : "products"} •{" "}
                          {pkg.duration_formatted}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold text-[#F5A623]">
                            RM{(pkg.price / 100).toFixed(2)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            RM{pkg.effective_price.toFixed(2)} per item
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F5A623] mx-auto mb-4"></div>
                <p className="text-muted-foreground">
                  Loading boost packages...
                </p>
              </div>
            )}

            {/* No matching packages message */}
            {boostPackages &&
              boostPackages.length > 0 &&
              !boostPackages.some(
                (pkg: any) => pkg.item_count === boostedProducts.length,
              ) && (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    No matching packages
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    No boost packages are available for {boostedProducts.length}{" "}
                    {boostedProducts.length === 1 ? "product" : "products"}.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Available package sizes:{" "}
                    {boostPackages.map((pkg: any) => pkg.item_count).join(", ")}{" "}
                    products
                  </p>
                </div>
              )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBoostDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Footer />
    </div>
  );
}
