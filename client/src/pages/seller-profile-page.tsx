import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductWithDetails, User } from "@shared/schema";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SellerHeader from "@/components/seller/seller-header";
import SellerInfo from "@/components/seller/seller-info";
import ProductCard from "@/components/product-card";
import { ProductFilters } from "@/components/product-filters";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface SellerProfileWithStats extends User {
  stats: {
    productCount: number;
    averageRating: number;
    totalSales: number;
    joinDate: string;
  };
}

interface SellerProductsResponse {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  products: ProductWithDetails[];
}

export default function SellerProfilePage() {
  const { id } = useParams();
  const sellerId = parseInt(id || "0");
  const { toast } = useToast();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("all");
  const [sortOption, setSortOption] = useState("popular");
  const [isFollowing, setIsFollowing] = useState(false);
  
  const productsPerPage = 12;
  
  // Fetch seller profile information
  const { data: seller, isLoading: isLoadingSeller, error: sellerError } = useQuery<SellerProfileWithStats>({
    queryKey: [`/api/sellers/${sellerId}`],
    enabled: !!sellerId,
  });
  
  // Fetch seller's categories
  const { data: categories } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/categories"],
  });
  
  // Fetch follow status
  const { data: followStatus } = useQuery<{ following: boolean }>({
    queryKey: [`/api/sellers/${sellerId}/following`],
    enabled: !!sellerId
  });

  // Update isFollowing when followStatus changes
  useEffect(() => {
    if (followStatus) {
      setIsFollowing(followStatus.following);
    }
  }, [followStatus]);
  
  // Fetch seller's products with filtering, sorting, and pagination
  const { data: productsData, isLoading: isLoadingProducts } = useQuery<SellerProductsResponse>({
    queryKey: [`/api/sellers/${sellerId}/products`, { 
      category: activeTab !== "all" ? activeTab : undefined,
      sort: sortOption,
      page: currentPage,
      limit: productsPerPage
    }],
    enabled: !!sellerId,
  });
  
  // Toggle follow status
  const handleFollowToggle = async () => {
    try {
      if (isFollowing) {
        await apiRequest(`/api/sellers/${sellerId}/follow`, {
          method: "DELETE"
        });
        toast({
          title: "Success",
          description: "You have unfollowed this seller",
        });
      } else {
        await apiRequest(`/api/sellers/${sellerId}/follow`, {
          method: "POST"
        });
        toast({
          title: "Success",
          description: "You are now following this seller",
        });
      }
      
      setIsFollowing(!isFollowing);
      // Invalidate seller data and following status to refresh
      queryClient.invalidateQueries({ queryKey: [`/api/sellers/${sellerId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/sellers/${sellerId}/following`] });
    } catch (error) {
      console.error("Failed to toggle follow status:", error);
      toast({
        title: "Error",
        description: "Failed to update follow status. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    // Scroll to top of product section
    document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" });
  };
  
  if (isLoadingSeller) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center min-h-[50vh]">
        <LoadingSpinner />
      </div>
    );
  }
  
  if (sellerError || !seller) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Seller Not Found</h2>
          <p className="text-muted-foreground">
            The seller profile you are looking for does not exist or has been removed.
          </p>
          <Button className="mt-4" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }
  
  // Get unique categories from seller's products
  const uniqueCategories = categories
    ? [...new Set((productsData?.products || []).map(p => p.categoryId))]
        .filter(id => id !== undefined)
        .map(id => categories.find(c => c.id === id))
        .filter(Boolean)
    : [];
    
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Seller Header Component */}
      <SellerHeader 
        seller={seller} 
        isFollowing={isFollowing} 
        onFollowToggle={handleFollowToggle} 
      />
      
      {/* Seller Info and Products Section */}
      <div className="mt-16 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Seller Info Sidebar */}
        <div className="lg:col-span-1">
          <SellerInfo seller={seller} />
        </div>
        
        {/* Products Section */}
        <div className="lg:col-span-3" id="products-section">
          <Tabs
            defaultValue="all"
            onValueChange={(value) => {
              setActiveTab(value);
              setCurrentPage(1);
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <TabsList>
                <TabsTrigger value="all">All Perfumes</TabsTrigger>
                {uniqueCategories.map(category => (
                  <TabsTrigger key={category?.id} value={String(category?.id)}>{category?.name}</TabsTrigger>
                ))}
              </TabsList>

              <ProductFilters sortOption={sortOption} onSortChange={(value) => setSortOption(value)} />
            </div>

            {/* Content for All Categories */}
            <TabsContent value="all" className="mt-0">
              {isLoadingProducts ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : (
                <>
                  {productsData?.products && productsData.products.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {productsData.products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">No products found.</p>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
            
            {/* Content for Each Category */}
            {uniqueCategories.map(category => (
              <TabsContent key={category?.id} value={String(category?.id)} className="mt-0">
                {isLoadingProducts ? (
                  <div className="flex justify-center py-12">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <>
                    {productsData?.products && productsData.products.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {productsData.products.map((product) => (
                          <ProductCard key={product.id} product={product} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">No products found in this category.</p>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>

          {/* Pagination */}
          {productsData && productsData.totalPages > 1 && (
            <div className="flex justify-center mt-8">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  <span className="sr-only">Previous page</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m15 18-6-6 6-6"/>
                  </svg>
                </Button>

                {Array.from({ length: productsData.totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first page, last page, current page, and pages around current
                  const shouldShow = page === 1 || page === productsData.totalPages || Math.abs(page - currentPage) <= 1;

                  if (!shouldShow && (page === 2 || page === productsData.totalPages - 1)) {
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
                  onClick={() => handlePageChange(Math.min(productsData.totalPages, currentPage + 1))}
                  disabled={currentPage === productsData.totalPages}
                >
                  <span className="sr-only">Next page</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="m9 18 6-6-6-6"/>
                  </svg>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}