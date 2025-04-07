import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProductWithDetails, InsertProduct, Category } from "@shared/schema";
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
  SelectValue 
} from "@/components/ui/select";
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
  X
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define product form schema
const productSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  brand: z.string().min(2, { message: "Brand must be at least 2 characters" }),
  description: z.string().min(10, { message: "Description must be at least 10 characters" }),
  price: z.number().min(0.01, { message: "Price must be greater than 0" }),
  imageUrl: z.string().url({ message: "Please enter a valid image URL" }), // Keep for compatibility, will be updated in backend
  imageFiles: z.any().optional(), // Will hold the actual file objects for upload
  stockQuantity: z.number().int().min(0, { message: "Stock quantity must be 0 or greater" }),
  categoryId: z.number().int().positive({ message: "Please select a category" }),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  // Secondhand perfume specific fields
  remainingPercentage: z.number().int().min(1).max(100).default(100),
  batchCode: z.string().optional(),
  purchaseYear: z.number().int().min(1970).max(new Date().getFullYear()).optional(),
  boxCondition: z.enum(["Good", "Damaged", "No Box"]).default("Good"),
  listingType: z.enum(["fixed", "negotiable", "auction"]).default("fixed"),
  volume: z.string().min(2, { message: "Please enter a valid volume (e.g. 50ml, 100ml)" }).optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function SellerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("products");
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentProductId, setCurrentProductId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);

  // Fetch seller's products
  const { data: products, isLoading: isLoadingProducts } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/seller/products"],
  });
  
  // Fetch categories for the dropdown
  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Product form
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
      volume: "",
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
    mutationFn: async ({ id, product }: { id: number; product: InsertProduct }) => {
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
      await apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Product deleted",
        description: "Your product has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
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
    mutationFn: async ({ productId, images }: { productId: number, images: File[] }) => {
      // Step 1: Create placeholder entries for each image in the database
      const registerPromises = images.map(async (file, index) => {
        // Generate a random UUID for the image
        const imageId = crypto.randomUUID();
        
        // Register the image metadata in the database
        const registerResponse = await fetch('/api/product-images', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productId,
            imageUrl: `image-id-${imageId}`, // Temporary URL with UUID
            imageOrder: index,
            imageName: file.name || `Image ${index + 1}`
          }),
        });
        
        if (!registerResponse.ok) {
          throw new Error(`Failed to register image ${index}`);
        }
        
        // Get the registered image record with its ID
        const registeredImage = await registerResponse.json();
        
        // Step 2: Upload the actual image file to object storage
        const formData = new FormData();
        formData.append('image', file);
        
        const uploadResponse = await fetch(`/api/product-images/${registeredImage.id}/upload`, {
          method: 'POST',
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload image ${index}`);
        }
        
        return await uploadResponse.json();
      });
      
      return Promise.all(registerPromises);
    },
    onSuccess: () => {
      console.log('Images registered and uploaded successfully');
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
          product: productWithSellerId 
        });
        productId = updatedProduct.id;
      } else {
        const newProduct = await createProductMutation.mutateAsync(productWithSellerId);
        productId = newProduct.id;
      }
      
      // After product is created/updated, register and upload images
      if (uploadedImages.length > 0) {
        await registerImagesMutation.mutateAsync({
          productId,
          images: uploadedImages
        });
      }
      
      // Close dialog after successful submission
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error in product submission:', error);
    }
  };

  // Query to fetch product images
  const { data: productImages } = useQuery({
    queryKey: ['product-images', currentProductId],
    queryFn: async () => {
      if (!currentProductId) return [];
      
      const response = await fetch(`/api/product-images/${currentProductId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch product images');
      }
      return response.json();
    },
    enabled: !!currentProductId && isEditMode,
  });

  // Edit product
  const handleEditProduct = (product: ProductWithDetails) => {
    setIsEditMode(true);
    setCurrentProductId(product.id);
    
    // Clear existing image previews
    setUploadedImages([]);
    imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    setImagePreviewUrls([]);
    
    // If we have an image URL from the product, add it to the previews
    if (product.imageUrl) {
      setImagePreviewUrls([product.imageUrl]);
    }
    
    // If the product has images in the product.images array, show them in the preview
    if (product.images && product.images.length > 0) {
      const existingImageUrls = product.images.map(img => img.imageUrl);
      setImagePreviewUrls(existingImageUrls);
    }
    
    form.reset({
      name: product.name,
      brand: product.brand,
      description: product.description || "",
      price: product.price,
      imageUrl: product.imageUrl,
      stockQuantity: product.stockQuantity,
      categoryId: product.categoryId || 1,
      isNew: product.isNew === null ? false : product.isNew,
      isFeatured: product.isFeatured === null ? false : product.isFeatured,
      // Secondhand perfume specific fields
      remainingPercentage: product.remainingPercentage || 100,
      batchCode: product.batchCode || "",
      purchaseYear: product.purchaseYear || new Date().getFullYear(),
      boxCondition: (product.boxCondition as "Good" | "Damaged" | "No Box") || "Good",
      listingType: (product.listingType as "fixed" | "negotiable" | "auction") || "fixed",
      volume: product.volume || "",
    });
    
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
    
    // Limit to 5 images
    const newFiles: File[] = Array.from(files).slice(0, 5);
    
    // Create preview URLs
    const newPreviewUrls = newFiles.map(file => URL.createObjectURL(file));
    
    setUploadedImages(newFiles);
    setImagePreviewUrls(newPreviewUrls);
    
    // Update form with first image URL as a placeholder
    // In a real implementation, we would properly handle multiple images
    if (newFiles.length > 0) {
      form.setValue('imageUrl', newPreviewUrls[0]);
    }
  };
  
  // Remove image from preview
  const removeImage = (index: number) => {
    const newImages = [...uploadedImages];
    const newPreviewUrls = [...imagePreviewUrls];
    
    // Revoke object URL to prevent memory leaks
    URL.revokeObjectURL(newPreviewUrls[index]);
    
    newImages.splice(index, 1);
    newPreviewUrls.splice(index, 1);
    
    setUploadedImages(newImages);
    setImagePreviewUrls(newPreviewUrls);
    
    // Update form with first remaining image or empty string
    form.setValue('imageUrl', newPreviewUrls[0] || '');
  };

  // Open dialog for new product
  const handleAddNewProduct = () => {
    setIsEditMode(false);
    setCurrentProductId(null);
    // Clear image states
    setUploadedImages([]);
    setImagePreviewUrls([]);
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
      // Secondhand perfume specific fields
      remainingPercentage: 100,
      batchCode: "",
      purchaseYear: new Date().getFullYear(),
      boxCondition: "Good",
      listingType: "fixed",
      volume: "",
    });
    setIsDialogOpen(true);
  };

  // Filter products by search query
  const filteredProducts = products?.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate dashboard statistics
  const totalProducts = products?.length || 0;
  const totalStock = products?.reduce((sum, product) => sum + product.stockQuantity, 0) || 0;
  const averagePrice = products?.length 
    ? products.reduce((sum, product) => sum + product.price, 0) / products.length 
    : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow bg-gray-50">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
            <div>
              <h1 className="font-playfair text-3xl font-bold mb-2">Seller Dashboard</h1>
              <p className="text-gray-600">Manage your perfume products and view insights</p>
            </div>
            <Button 
              onClick={handleAddNewProduct}
              className="mt-4 md:mt-0 bg-gold text-rich-black hover:bg-metallic-gold flex items-center"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add New Product
            </Button>
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
                    <h3 className="text-2xl font-bold">${averagePrice.toFixed(2)}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
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
                  ) : filteredProducts && filteredProducts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Image</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Stock</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProducts.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell>
                                <div className="w-10 h-10 rounded overflow-hidden bg-gray-100">
                                  <img 
                                    src={product.imageUrl} 
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{product.name}</TableCell>
                              <TableCell>{product.brand}</TableCell>
                              <TableCell>{product.category?.name || "Uncategorized"}</TableCell>
                              <TableCell>${product.price.toFixed(2)}</TableCell>
                              <TableCell>{product.stockQuantity}</TableCell>
                              <TableCell>
                                {product.isNew && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gold text-rich-black mr-1">
                                    New
                                  </span>
                                )}
                                {product.isFeatured && (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-metallic-gold text-white">
                                    Featured
                                  </span>
                                )}
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
                                    onClick={() => handleDeleteProduct(product.id)}
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
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Package className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No products found</h3>
                      <p className="text-gray-500 mb-6">
                        {searchQuery ? "No products match your search criteria" : "You haven't added any products yet"}
                      </p>
                      {searchQuery ? (
                        <Button variant="outline" onClick={() => setSearchQuery("")}>
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
                      <h3 className="text-lg font-medium mb-4">Top Rated Products</h3>
                      
                      {products && products.length > 0 ? (
                        <div className="space-y-4">
                          {products
                            .filter(p => p.averageRating)
                            .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
                            .slice(0, 3)
                            .map(product => (
                              <div key={product.id} className="flex items-center">
                                <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 mr-3">
                                  <img 
                                    src={product.imageUrl} 
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="flex-grow">
                                  <div className="font-medium">{product.name}</div>
                                  <div className="flex items-center">
                                    <div className="flex text-gold">
                                      {[...Array(5)].map((_, i) => (
                                        <Star 
                                          key={i} 
                                          className={`h-3 w-3 ${i < Math.floor(product.averageRating || 0) ? 'fill-gold' : ''}`} 
                                        />
                                      ))}
                                    </div>
                                    <span className="text-xs text-gray-500 ml-1">
                                      ({product.reviews?.length || 0})
                                    </span>
                                  </div>
                                </div>
                                <div className="font-semibold">${product.price.toFixed(2)}</div>
                              </div>
                            ))
                          }
                          
                          {!products.some(p => p.averageRating) && (
                            <p className="text-gray-500">No rated products yet</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-500">No product data available</p>
                      )}
                    </div>
                    
                    <div className="rounded-lg border p-6">
                      <h3 className="text-lg font-medium mb-4">Inventory Status</h3>
                      
                      {products && products.length > 0 ? (
                        <div>
                          <div className="mb-6">
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">Low Stock (≤ 5 units)</span>
                              <span className="text-sm font-medium">
                                {products.filter(p => p.stockQuantity <= 5).length} products
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-red-500 h-2 rounded-full" 
                                style={{ 
                                  width: `${(products.filter(p => p.stockQuantity <= 5).length / products.length) * 100}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                          
                          <div className="mb-6">
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">Medium Stock (6-20 units)</span>
                              <span className="text-sm font-medium">
                                {products.filter(p => p.stockQuantity > 5 && p.stockQuantity <= 20).length} products
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-yellow-500 h-2 rounded-full" 
                                style={{ 
                                  width: `${(products.filter(p => p.stockQuantity > 5 && p.stockQuantity <= 20).length / products.length) * 100}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">Good Stock ({'>'}{' '}20 units)</span>
                              <span className="text-sm font-medium">
                                {products.filter(p => p.stockQuantity > 20).length} products
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-500 h-2 rounded-full" 
                                style={{ 
                                  width: `${(products.filter(p => p.stockQuantity > 20).length / products.length) * 100}%` 
                                }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500">No inventory data available</p>
                      )}
                    </div>
                  </div>
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
                      <h3 className="text-lg font-medium mb-4">Account Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="account-name">Name</Label>
                          <Input 
                            id="account-name" 
                            value={`${user?.firstName || ''} ${user?.lastName || ''}`} 
                            disabled 
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="account-email">Email</Label>
                          <Input 
                            id="account-email" 
                            value={user?.email || ''} 
                            disabled 
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="account-username">Username</Label>
                          <Input 
                            id="account-username" 
                            value={user?.username || ''} 
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
                      <h3 className="text-lg font-medium mb-4">Notification Preferences</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="notify-sales">Sales notifications</Label>
                          <Checkbox id="notify-sales" checked />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="notify-reviews">New review notifications</Label>
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
      
      {/* Product Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Product" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              {isEditMode 
                ? "Update your product information below" 
                : "Fill in the details to add a new perfume product"}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitProduct)} className="space-y-6">
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
                      <FormLabel>Price ($)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0.01" 
                          step="0.01"
                          placeholder="99.99" 
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                          placeholder="50"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
                        onValueChange={(value) => field.onChange(parseInt(value))}
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
              </div>
              
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Images (up to 5)</FormLabel>
                    <div className="flex flex-col gap-2">
                      <div className="border rounded-md p-4 bg-gray-50">
                        <div className="flex items-center justify-center w-full">
                          <label htmlFor="product-images" className="cursor-pointer w-full">
                            <div className="flex flex-col items-center justify-center py-4 border-2 border-dashed rounded-md border-gray-300 hover:border-gold transition-colors">
                              <Upload className="h-8 w-8 text-gray-400 mb-2" />
                              <p className="text-sm text-gray-500">Click to upload images</p>
                              <p className="text-xs text-gray-400 mt-1">JPG, PNG, or GIF up to 5MB</p>
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
                
                <FormField
                  control={form.control}
                  name="isFeatured"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="m-0">Feature this product</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              
              {/* Secondhand perfume specific fields */}
              <h3 className="text-lg font-medium mt-8 mb-4">Perfume Condition Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          onChange={e => field.onChange(parseInt(e.target.value) || 100)}
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
                          onChange={e => field.onChange(parseInt(e.target.value) || new Date().getFullYear())}
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
                        <Input 
                          placeholder="e.g., 8K01"
                          {...field}
                        />
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
                          <SelectItem value="negotiable">Negotiable</SelectItem>
                          <SelectItem value="auction">Auction</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="volume"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Volume</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., 50ml, 100ml, 3.4oz"
                          {...field}
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
                  disabled={createProductMutation.isPending || updateProductMutation.isPending}
                >
                  {(createProductMutation.isPending || updateProductMutation.isPending) ? (
                    <span className="flex items-center">
                      <span className="animate-spin mr-2 h-4 w-4 border-b-2 border-rich-black rounded-full"></span>
                      {isEditMode ? "Updating..." : "Creating..."}
                    </span>
                  ) : (
                    isEditMode ? "Update Product" : "Create Product"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      <Footer />
    </div>
  );
}
