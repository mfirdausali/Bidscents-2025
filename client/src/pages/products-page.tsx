import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ProductWithDetails, Category } from "@shared/schema";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { ProductCard } from "@/components/ui/product-card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FilterX } from "lucide-react";

export default function ProductsPage() {
  // Parse query params
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  
  // State for filters
  const [categoryId, setCategoryId] = useState<number | undefined>(
    searchParams.get("category") ? Number(searchParams.get("category")) : undefined
  );
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get("search") || "");
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(500);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [brands, setBrands] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState("featured");
  
  // Function to update URL params
  const updateUrlParams = (params: Record<string, string | undefined>) => {
    const urlParams = new URLSearchParams(location.split("?")[1] || "");
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        urlParams.delete(key);
      } else {
        urlParams.set(key, value);
      }
    });
    
    const newUrl = urlParams.toString() ? `/products?${urlParams.toString()}` : "/products";
    setLocation(newUrl, { replace: true });
  };

  // Fetch categories
  const { data: categories, isLoading: isLoadingCategories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Fetch products with filters
  const fetchProducts = () => {
    let url = "/api/products?";
    const params = new URLSearchParams();
    
    if (categoryId) params.append("category", categoryId.toString());
    if (searchQuery) params.append("search", searchQuery);
    if (minPrice > 0) params.append("minPrice", minPrice.toString());
    if (maxPrice < 500) params.append("maxPrice", maxPrice.toString());
    if (selectedBrands.length > 0) {
      selectedBrands.forEach(brand => {
        params.append("brand", brand);
      });
    }
    
    return fetch(`${url}${params.toString()}`, { credentials: "include" })
      .then(res => res.json());
  };

  const { 
    data: products, 
    isLoading: isLoadingProducts,
    refetch
  } = useQuery<ProductWithDetails[]>({
    queryKey: ["/api/products", categoryId, searchQuery, minPrice, maxPrice, selectedBrands],
    queryFn: fetchProducts,
  });

  // Extract unique brands from products
  useEffect(() => {
    if (products) {
      const uniqueBrands = Array.from(new Set(products.map(product => product.brand)));
      setBrands(uniqueBrands);
    }
  }, [products]);

  // Apply filters
  const applyFilters = () => {
    setMinPrice(priceRange[0]);
    setMaxPrice(priceRange[1]);
    
    // Update URL with all current filter parameters
    const urlParams: Record<string, string | undefined> = {
      category: categoryId !== undefined ? categoryId.toString() : undefined,
      search: searchQuery || undefined,
      minPrice: priceRange[0] > 0 ? priceRange[0].toString() : undefined,
      maxPrice: priceRange[1] < 500 ? priceRange[1].toString() : undefined
    };
    
    // Add brands if any selected
    if (selectedBrands.length > 0) {
      selectedBrands.forEach((brand, index) => {
        urlParams[`brand${index}`] = brand;
      });
    }
    
    updateUrlParams(urlParams);
    refetch();
  };

  // Reset filters
  const resetFilters = () => {
    setCategoryId(undefined);
    setSearchQuery("");
    setPriceRange([0, 500]);
    setMinPrice(0);
    setMaxPrice(500);
    setSelectedBrands([]);
    
    // Update URL
    setLocation("/products", { replace: true });
    
    refetch();
  };

  // Toggle brand selection
  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => 
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  };

  // Sort products
  const sortedProducts = () => {
    if (!products) return [];
    
    let sorted = [...products];
    
    switch (sortOption) {
      case "low":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "high":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "newest":
        sorted.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        break;
      case "bestselling":
        // This would require a sales count field, so we'll default to featured
        break;
      case "featured":
      default:
        sorted = sorted.filter(p => p.isFeatured).concat(sorted.filter(p => !p.isFeatured));
        break;
    }
    
    return sorted;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow">
        {/* Hero section */}
        <div className="bg-gray-100 py-8">
          <div className="container mx-auto px-6">
            <h1 className="font-playfair text-3xl md:text-4xl font-bold mb-2">
              Explore Our Collection
            </h1>
            <p className="text-gray-600">
              Discover premium fragrances from around the world
            </p>
          </div>
        </div>
        
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Filters sidebar */}
            <div className="lg:w-1/4">
              <div className="bg-white p-6 rounded-lg shadow mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-playfair text-xl font-medium">Filters</h2>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={resetFilters}
                    className="text-sm flex items-center"
                  >
                    <FilterX className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                </div>
                
                {/* Categories filter */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Categories</h3>
                  {isLoadingCategories ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-gold" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <input
                          type="radio"
                          id="all-categories"
                          name="category"
                          className="mr-2"
                          checked={categoryId === undefined}
                          onChange={() => {
                            setCategoryId(undefined);
                            updateUrlParams({ category: undefined });
                          }}
                        />
                        <Label htmlFor="all-categories">All Categories</Label>
                      </div>
                      {categories?.map((category) => (
                        <div key={category.id} className="flex items-center">
                          <input
                            type="radio"
                            id={`category-${category.id}`}
                            name="category"
                            className="mr-2"
                            checked={categoryId === category.id}
                            onChange={() => {
                              setCategoryId(category.id);
                              updateUrlParams({ category: category.id.toString() });
                            }}
                          />
                          <Label htmlFor={`category-${category.id}`}>{category.name}</Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Price range filter */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Price Range</h3>
                  <div className="px-2">
                    <Slider
                      value={priceRange}
                      min={0}
                      max={500}
                      step={10}
                      onValueChange={(value) => setPriceRange(value as [number, number])}
                      className="mb-6"
                      
                    />
                    <div className="flex justify-between">
                      <span>${priceRange[0]}</span>
                      <span>${priceRange[1]}</span>
                    </div>
                  </div>
                </div>
                
                {/* Brands filter */}
                <div className="mb-6">
                  <h3 className="font-medium mb-3">Brands</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {brands.map((brand) => (
                      <div key={brand} className="flex items-center">
                        <Checkbox
                          id={`brand-${brand}`}
                          checked={selectedBrands.includes(brand)}
                          onCheckedChange={() => toggleBrand(brand)}
                          className="mr-2"
                        />
                        <Label htmlFor={`brand-${brand}`}>{brand}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <Button 
                  onClick={applyFilters}
                  className="w-full bg-gold text-rich-black hover:bg-metallic-gold"
                >
                  Apply Filters
                </Button>
              </div>
            </div>
            
            {/* Products grid */}
            <div className="lg:w-3/4">
              <div className="bg-white p-6 rounded-lg shadow mb-6">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6">
                  <h2 className="font-playfair text-2xl font-medium mb-4 md:mb-0">
                    {searchQuery 
                      ? `Search Results for "${searchQuery}"` 
                      : categoryId && categories 
                        ? categories.find(c => c.id === categoryId)?.name 
                        : "All Perfumes"}
                  </h2>
                  <div className="flex items-center w-full md:w-auto">
                    <Input
                      type="text"
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value) {
                          updateUrlParams({ search: e.target.value });
                        } else {
                          updateUrlParams({ search: undefined });
                        }
                      }}
                      className="mr-2 w-full md:w-48"
                    />
                    <Select value={sortOption} onValueChange={setSortOption}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="featured">Featured</SelectItem>
                        <SelectItem value="low">Price: Low to High</SelectItem>
                        <SelectItem value="high">Price: High to Low</SelectItem>
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="bestselling">Best Selling</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {isLoadingProducts ? (
                  <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-gold" />
                  </div>
                ) : products && products.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedProducts().map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <p className="text-xl text-gray-500 mb-4">No products found</p>
                    <p className="text-gray-500 mb-6">Try adjusting your filters or search criteria</p>
                    <Button onClick={resetFilters} variant="outline">
                      Reset Filters
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
