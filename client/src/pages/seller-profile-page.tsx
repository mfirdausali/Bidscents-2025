import React, { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit,
  MessageSquare, 
  MapPin,
  Save,
  Star, 
  Store, 
  ThumbsUp, 
  Truck, 
  Users,
  X,
  Camera,
  ImagePlus
} from "lucide-react";

import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ProductCard } from "../components/ui/product-card";
import { ProductFilters } from "../components/product-filters";
import { ProfileEditModal } from "../components/ui/profile-edit-modal";
import { ImageUploadModal } from "../components/ui/image-upload-modal";
import { VerifiedBadge } from "../components/ui/verified-badge";
import { MetaTags } from "../components/seo/meta-tags";
import { User, ProductWithDetails } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";

export default function SellerProfilePage() {
  const [match, params] = useRoute("/sellers/:id");
  const sellerId = params?.id ? parseInt(params.id) : 0;
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("all");
  const [sortOption, setSortOption] = useState("popular");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Modal states
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  
  // Check if the current user is the owner of this profile
  const isProfileOwner = user?.id === sellerId;
  
  const productsPerPage = 12;

  // Fetch seller profile
  const { 
    data: seller, 
    isLoading: isSellerLoading, 
    error: sellerError 
  } = useQuery({
    queryKey: ["/api/sellers", sellerId],
    queryFn: async () => {
      const response = await fetch(`/api/sellers/${sellerId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch seller profile");
      }
      return response.json() as Promise<User>;
    },
    enabled: !!sellerId
  });

  // Fetch seller products with filtering and pagination
  const { 
    data: productsData, 
    isLoading: isProductsLoading, 
    error: productsError 
  } = useQuery({
    queryKey: ["/api/sellers", sellerId, "products", { category: activeTab, sort: sortOption, page: currentPage, limit: productsPerPage }],
    queryFn: async () => {
      const response = await fetch(
        `/api/sellers/${sellerId}/products?category=${activeTab}&sort=${sortOption}&page=${currentPage}&limit=${productsPerPage}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch seller products");
      }
      return response.json() as Promise<{
        products: ProductWithDetails[];
        pagination: {
          page: number;
          limit: number;
          totalProducts: number;
          totalPages: number;
        }
      }>;
    },
    enabled: !!sellerId
  });

  // Handle category tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  // Handle sort option change
  const handleSortChange = (value: string) => {
    setSortOption(value);
    setCurrentPage(1);
  };

  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    // Scroll to top of product section
    document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" });
  };
  
  // Handle opening the edit profile modal
  const handleOpenProfileModal = () => {
    setIsProfileModalOpen(true);
  };

  // Handle closing the edit profile modal
  const handleCloseProfileModal = () => {
    setIsProfileModalOpen(false);
  };
  
  // Check if the user is verified directly from Supabase
  const [isVerifiedFromSupabase, setIsVerifiedFromSupabase] = useState<boolean | null>(null);
  
  useEffect(() => {
    async function checkVerificationStatus() {
      if (sellerId) {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('is_verified')
            .eq('id', sellerId)
            .single();
          
          if (error) {
            console.error('Error fetching verification status:', error);
            return;
          }
          
          setIsVerifiedFromSupabase(!!data?.is_verified);
        } catch (error) {
          console.error('Error in verification check:', error);
        }
      }
    }
    
    checkVerificationStatus();
  }, [sellerId]);

  // Handle avatar modal open/close
  const handleOpenAvatarModal = () => {
    setIsAvatarModalOpen(true);
  };
  
  const handleCloseAvatarModal = () => {
    setIsAvatarModalOpen(false);
  };
  
  // Handle cover photo modal open/close
  const handleOpenCoverModal = () => {
    setIsCoverModalOpen(true);
  };
  
  const handleCloseCoverModal = () => {
    setIsCoverModalOpen(false);
  };

  // Handle successful profile update
  const handleProfileUpdateSuccess = () => {
    // Refresh the seller data
    queryClient.invalidateQueries({ queryKey: ["/api/sellers", sellerId] });
  };

  // If there was an error fetching the seller
  if (sellerError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <Card className="w-full max-w-md mx-auto">
            <CardContent className="p-6">
              <h1 className="text-2xl font-bold text-center mb-4">Seller Not Found</h1>
              <p className="text-center text-muted-foreground mb-6">
                The seller you're looking for doesn't exist or isn't available.
              </p>
              <div className="flex justify-center">
                <Button asChild>
                  <Link href="/products">Browse Products</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // Prepare SEO-friendly meta tags for social sharing
  const getSellerName = () => {
    if (isSellerLoading || !seller) return "Perfume Seller";
    return seller.shopName || 
      (seller.firstName && seller.lastName ? `${seller.firstName} ${seller.lastName}'s Shop` : seller.username);
  };

  const getSellerDescription = () => {
    if (isSellerLoading || !seller) return "Premium perfumes from a trusted seller on BidScents";
    return seller.bio || 
      `${getSellerName()} offers premium perfumes and fragrances. ${
        seller.isVerified || isVerifiedFromSupabase ? 'Verified seller with authentic products.' : ''
      }`;
  };

  // Get the absolute URL for the profile image to use in social meta tags
  const getProfileImageUrl = () => {
    if (!seller?.avatarUrl) {
      // Provide a fallback image for social sharing when no avatar exists
      const baseUrl = typeof window !== 'undefined' 
        ? `${window.location.protocol}//${window.location.host}`
        : "https://bidscents.replit.app";
      
      return `${baseUrl}/logo-social.svg`; // Default store logo for social sharing
    }
    
    // Create an absolute URL for the avatar image
    // Use an absolute URL instead of a relative URL for better compatibility with social platforms
    const baseUrl = typeof window !== 'undefined' 
      ? `${window.location.protocol}//${window.location.host}`
      : "https://bidscents.replit.app"; // Fallback to replit app domain
    
    return `${baseUrl}/api/images/${seller.avatarUrl}`;
  };

  // Get the current URL for meta tags
  const getCurrentUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.href;
    }
    return `https://bidscents.replit.app/sellers/${sellerId}`;
  };

  // Ensure seller metadata doesn't have null values for type safety
  const shopName = seller?.shopName || undefined;
  const location = seller?.location || undefined;

  // Enhanced person schema for structured data
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": getSellerName(),
    "description": getSellerDescription(),
    "image": getProfileImageUrl(),
    "url": getCurrentUrl(),
    "jobTitle": "Perfume Seller",
    "worksFor": {
      "@type": "Organization",
      "name": "BidScents Marketplace",
      "url": "https://bidscents.replit.app"
    },
    "address": {
      "@type": "PostalAddress",
      "addressLocality": location || undefined
    },
    ...(isVerifiedFromSupabase || seller?.isVerified ? {
      "knowsAbout": ["Fragrances", "Perfumes", "Luxury Scents", "Perfume Collection"],
      "award": "Verified Seller"
    } : {}),
    "memberOf": {
      "@type": "Organization",
      "name": "BidScents Perfume Community"
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* SEO Meta Tags with Structured Data JSON-LD */}
      <MetaTags
        title={`${getSellerName()} | BidScents Perfume Seller`}
        description={getSellerDescription()}
        image={getProfileImageUrl()}
        url={getCurrentUrl()}
        shopName={shopName}
        location={location}
        type="profile"
        jsonLd={personSchema}
      />
      
      <Header />
      
      <main className="flex-grow">
        <div className="container mx-auto px-4 py-8">
          {/* Cover Image and Profile Section */}
          <div className="relative mb-8">
            <div className="h-48 md:h-64 w-full rounded-lg overflow-hidden bg-gray-100 relative">
              {/* Cover image placeholder if loading or no image */}
              {isSellerLoading ? (
                <Skeleton className="h-full w-full" />
              ) : seller?.coverPhoto ? (
                <img 
                  src={`/api/images/${seller.coverPhoto}`}
                  alt={`${getSellerName()} cover photo`}
                  className="w-full h-full object-cover"
                  loading="eager"
                  itemProp="image"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-r from-purple-200 to-indigo-200" />
              )}
              
              {/* Upload cover image button (only for profile owner) */}
              {isProfileOwner && !isSellerLoading && (
                <Button 
                  size="sm"
                  variant="secondary"
                  className="absolute top-3 right-3 opacity-80 hover:opacity-100"
                  onClick={handleOpenCoverModal}
                >
                  <ImagePlus className="h-4 w-4 mr-1" />
                  {seller?.coverPhoto ? 'Change Cover' : 'Add Cover Photo'}
                </Button>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-6 mt-4 md:mt-0 md:items-end md:absolute md:bottom-0 md:translate-y-1/2 md:left-8">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden border-4 border-background bg-background relative group">
                {isSellerLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  seller?.avatarUrl ? (
                    <img 
                      src={`/api/images/${seller.avatarUrl}`} 
                      alt={`${seller.firstName || ''} ${seller.lastName || ''} - ${seller.shopName || 'Perfume Shop'} Profile`} 
                      className="w-full h-full object-cover"
                      loading="eager" // Load profile image eagerly for SEO importance
                      itemProp="image" // Schema.org markup
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gray-100 text-gray-500" aria-label="No profile image available">
                      <Store className="h-12 w-12" />
                    </div>
                  )
                )}
                
                {/* Profile upload button (only for profile owner) */}
                {isProfileOwner && !isSellerLoading && (
                  <Button 
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-1 right-1 rounded-full h-8 w-8 opacity-90 hover:opacity-100 group-hover:opacity-100"
                    onClick={handleOpenAvatarModal}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="md:mb-4">
                <div className="flex items-center gap-2">
                  {isSellerLoading ? (
                    <Skeleton className="h-8 w-48" />
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <h1 className="text-2xl md:text-3xl font-bold" itemProp="name">
                          {seller?.shopName || (seller?.firstName && seller?.lastName 
                            ? `${seller.firstName} ${seller.lastName}'s Shop` 
                            : seller?.username)}
                        </h1>
                        {!isSellerLoading && (seller?.isVerified || isVerifiedFromSupabase) && (
                          <VerifiedBadge size="lg" className="ml-1" />
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  {isSellerLoading ? (
                    <Skeleton className="h-5 w-32" />
                  ) : (
                    <>
                      <div className="flex items-center">
                        <Star className="h-4 w-4 fill-primary text-primary" />
                        <span className="ml-1 font-medium">4.8</span>
                      </div>
                      <span className="text-muted-foreground">(Reviews coming soon)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="hidden md:flex absolute bottom-0 right-8 translate-y-1/2 gap-2">
              <Button>
                <MessageSquare className="mr-2 h-4 w-4" />
                Contact Seller
              </Button>
              <Button variant="outline">Follow Store</Button>
            </div>
          </div>

          {/* Mobile Badges and Buttons */}
          <div className="md:hidden mt-4 mb-6">
            <div className="flex flex-wrap gap-2 mb-4">
              {!isSellerLoading && (seller?.isVerified || isVerifiedFromSupabase) && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary">
                  <VerifiedBadge size="sm" />
                  <span className="text-sm font-medium">Verified</span>
                </div>
              )}
              {!isSellerLoading && seller?.isSeller && (
                <Badge variant="secondary">Professional Seller</Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1">
                <MessageSquare className="mr-2 h-4 w-4" />
                Contact
              </Button>
              <Button variant="outline" className="flex-1">
                Follow Store
              </Button>
            </div>
          </div>

          {/* Seller Info and Products Section */}
          <div className="mt-16 grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Seller Info Sidebar */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <h2 className="text-xl font-semibold">Seller Information</h2>
                </CardHeader>
                <CardContent className="space-y-4" itemScope itemType="https://schema.org/Person">
                  {isSellerLoading ? (
                    <>
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-3">
                        <Store className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">Products</p>
                          <p className="text-muted-foreground">
                            {productsData?.pagination.totalProducts || 0} items
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div className="w-full">
                          <p className="font-medium">Location</p>
                          <p className="text-muted-foreground" itemProp="location">{seller?.location || seller?.address || "Not specified"}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">Member Since</p>
                          <p className="text-muted-foreground">
                            {new Date().getFullYear().toString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <ThumbsUp className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">Satisfaction Rate</p>
                          <p className="text-muted-foreground">Coming soon</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Truck className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">Shipping</p>
                          <p className="text-muted-foreground">Fast & Reliable</p>
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <p className="font-medium">About</p>
                      {isProfileOwner && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={handleOpenProfileModal}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit Profile
                        </Button>
                      )}
                    </div>
                    
                    {isSellerLoading ? (
                      <>
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-full mb-2" />
                        <Skeleton className="h-4 w-3/4" />
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm" itemProp="description">
                        {seller?.bio || "Welcome to my perfume shop! I specialize in collecting and selling rare, vintage, and limited-edition fragrances from around the world."}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Products Section */}
            <div className="lg:col-span-3" id="products-section">
              <Tabs
                defaultValue="all"
                onValueChange={handleTabChange}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <TabsList>
                    <TabsTrigger value="all">All Perfumes</TabsTrigger>
                    <TabsTrigger value="Niche">Niche</TabsTrigger>
                    <TabsTrigger value="Men's Fragrances">Men's</TabsTrigger>
                    <TabsTrigger value="Unisex">Unisex</TabsTrigger>
                  </TabsList>

                  <ProductFilters 
                    sortOption={sortOption} 
                    onSortChange={handleSortChange} 
                  />
                </div>

                <TabsContent value="all" className="mt-0">
                  {isProductsLoading ? (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                      {Array(6).fill(0).map((_, index) => (
                        <Card key={index} className="overflow-hidden">
                          <Skeleton className="h-48 w-full" />
                          <CardContent className="p-4">
                            <Skeleton className="h-5 w-2/3 mb-2" />
                            <Skeleton className="h-5 w-1/3 mb-2" />
                            <Skeleton className="h-4 w-1/4" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : productsError ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">
                        Failed to load products. Please try again later.
                      </p>
                      <Button 
                        onClick={() => window.location.reload()}
                        variant="outline"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : productsData?.products.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">
                        No products found in this category.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                      {productsData?.products.map((product) => (
                        <ProductCard 
                          key={product.id} product={product}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Other tab content will be identical to the "all" tab */}
                <TabsContent value="Niche" className="mt-0">
                  {/* Same content as "all" tab but filtered */}
                  {/* This is handled by the backend query parameters */}
                </TabsContent>

                <TabsContent value="Men's Fragrances" className="mt-0">
                  {/* Same content as "all" tab but filtered */}
                  {/* This is handled by the backend query parameters */}
                </TabsContent>

                <TabsContent value="Unisex" className="mt-0">
                  {/* Same content as "all" tab but filtered */}
                  {/* This is handled by the backend query parameters */}
                </TabsContent>
              </Tabs>

              {/* Pagination */}
              {!isProductsLoading && !productsError && productsData && productsData.pagination.totalPages > 1 && (
                <div className="flex justify-center mt-8">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="sr-only">Previous page</span>
                    </Button>

                    {productsData && Array.from({ length: productsData.pagination.totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first page, last page, current page, and pages around current
                      const shouldShow = 
                        page === 1 || 
                        page === productsData.pagination.totalPages || 
                        Math.abs(page - currentPage) <= 1;

                      if (!shouldShow && (page === 2 || page === productsData.pagination.totalPages - 1)) {
                        return (
                          <span key={page} className="flex h-9 w-9 items-center justify-center">
                            ...
                          </span>
                        );
                      }

                      if (!shouldShow) return null;

                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="icon"
                          onClick={() => handlePageChange(page)}
                          className="h-9 w-9"
                        >
                          {page}
                        </Button>
                      );
                    })}

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => productsData && handlePageChange(Math.min(productsData.pagination.totalPages, currentPage + 1))}
                      disabled={productsData ? currentPage === productsData.pagination.totalPages : true}
                    >
                      <ChevronRight className="h-4 w-4" />
                      <span className="sr-only">Next page</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <Footer />

      {/* Modals */}
      {seller && isProfileOwner && (
        <>
          {/* Profile Edit Modal */}
          <ProfileEditModal
            isOpen={isProfileModalOpen}
            onClose={handleCloseProfileModal}
            userData={{
              id: sellerId,
              shopName: seller.shopName,
              location: seller.location,
              bio: seller.bio
            }}
            onSuccess={handleProfileUpdateSuccess}
          />
          
          {/* Avatar upload modal */}
          <ImageUploadModal
            isOpen={isAvatarModalOpen}
            onClose={handleCloseAvatarModal}
            userId={sellerId}
            imageType="avatar"
            onSuccess={handleProfileUpdateSuccess}
          />
          
          {/* Cover photo upload modal */}
          <ImageUploadModal
            isOpen={isCoverModalOpen}
            onClose={handleCloseCoverModal}
            userId={sellerId}
            imageType="cover"
            onSuccess={handleProfileUpdateSuccess}
          />
        </>
      )}
    </div>
  );
}