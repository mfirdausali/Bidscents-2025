import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductWithDetails } from "@shared/schema";
import { analytics } from "@/hooks/use-analytics";
import { Header } from "@/components/ui/header";
import { Footer } from "@/components/ui/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContactSellerButton } from "@/components/ui/contact-seller-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from "lucide-react";
import { useAuth } from "@/hooks/use-supabase-auth";
import { MetaTags } from "@/components/seo/meta-tags";

export default function ProductDetailPage() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ? parseInt(params.id) : 0;
  const { user } = useAuth();
  
  const [selectedSize, setSelectedSize] = useState("50ml");
  const [activeTab, setActiveTab] = useState("description");

  // State for current displayed image
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Fetch product details
  const { data: product, isLoading } = useQuery<ProductWithDetails>({
    queryKey: [`/api/products/${productId}`],
    enabled: !!productId,
  });

  // Track product view when product loads
  useEffect(() => {
    if (product) {
      analytics.viewItem({
        item_id: product.id.toString(),
        item_name: product.name,
        item_category: product.category?.name || 'Perfume',
        price: product.price,
        item_brand: product.brand
      });
    }
  }, [product]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold"></div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-playfair mb-4">Product Not Found</h2>
            <p className="text-gray-600 mb-6">The product you're looking for doesn't exist or has been removed.</p>
            <Button asChild>
              <a href="/products">Browse Products</a>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Generate structured data for product
  const jsonLdData = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "description": product.description || `${product.name} by ${product.brand}`,
    "brand": {
      "@type": "Brand",
      "name": product.brand
    },
    "image": product.images && product.images.length > 0 
      ? `${window.location.origin}/api/images/${product.images[0]?.imageUrl}` 
      : product.imageUrl 
        ? `${window.location.origin}/api/images/${product.imageUrl}` 
        : `${window.location.origin}/placeholder.jpg`,
    "offers": {
      "@type": "Offer",
      "price": product.price,
      "priceCurrency": "MYR",
      "availability": product.isActive ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "itemCondition": product.isNew ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
      "seller": product.seller ? {
        "@type": "Person",
        "name": product.seller.username || "Seller"
      } : undefined
    },
    "additionalProperty": [
      {
        "@type": "PropertyValue",
        "name": "Volume",
        "value": product.volume || "N/A"
      },
      {
        "@type": "PropertyValue",
        "name": "Remaining",
        "value": `${product.remainingPercentage || 100}%`
      }
    ]
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      {/* SEO Meta Tags */}
      <MetaTags
        title={`${product.name} by ${product.brand} - ${product.volume || ''} | BidScents`}
        description={`${product.description || `Authentic ${product.name} perfume by ${product.brand}`}. ${product.remainingPercentage || 100}% full. Price: RM ${product.price.toFixed(2)}. Sold by ${product.seller?.username || 'verified seller'}.`}
        image={product.images && product.images.length > 0 
          ? `${window.location.origin}/api/images/${product.images[0]?.imageUrl}` 
          : product.imageUrl 
            ? `${window.location.origin}/api/images/${product.imageUrl}` 
            : undefined}
        url={`${window.location.origin}/products/${productId}`}
        type="product"
        shopName={product.seller?.username}
        location={product.seller?.location || ""}
        jsonLd={jsonLdData}
      />
      
      <main className="flex-grow">
        <div className="container mx-auto px-6 py-12">
          {/* Breadcrumbs */}
          <div className="mb-8 text-sm text-gray-500">
            <a href="/" className="hover:text-gold">Home</a> {" / "}
            <a href="/products" className="hover:text-gold">Products</a> {" / "}
            <span>{product.name}</span>
          </div>
          
          {/* Product detail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Left: Product image */}
            <div>
              <div className="rounded-lg overflow-hidden bg-gray-50 mb-4">
                <img 
                  src={product.images && product.images.length > 0 
                    ? `/api/images/${product.images[currentImageIndex]?.imageUrl}` 
                    : `/api/images/${product.imageUrl}`} 
                  alt={product.name} 
                  className="w-full h-auto object-cover max-h-[500px]"
                />
              </div>
              
              {/* Image thumbnails */}
              {product.images && product.images.length > 0 && (
                <div className="flex space-x-2 mt-4 overflow-x-auto">
                  {product.images.map((image, index) => (
                    <div 
                      key={image.id} 
                      className={`w-16 h-16 rounded-md overflow-hidden cursor-pointer border-2 ${
                        currentImageIndex === index ? 'border-gold' : 'border-transparent'
                      }`}
                      onClick={() => setCurrentImageIndex(index)}
                    >
                      <img 
                        src={`/api/images/${image.imageUrl}`} 
                        alt={`${product.name} - Image ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Right: Product info */}
            <div>
              <div className="mb-4">
                {/* Condition badge */}
                <div className="mb-2">
                  {product.isNew ? (
                    <Badge className="bg-gray-800 text-white">Like New</Badge>
                  ) : (
                    <Badge className="bg-blue-100 text-blue-800">{product.remainingPercentage || 100}% Full</Badge>
                  )}
                  
                  {/* Listing type badge */}
                  <Badge className="bg-gold bg-gray-100 text-rich-black ml-2">
                    {product.listingType === "auction" ? "Auction" : 
                     product.listingType === "negotiable" ? "Negotiable" : "Fixed Price"}
                  </Badge>
                </div>
                
                <div className="text-gray-500 mb-1">
                  {product.brand}
                </div>
                <div className="flex items-center mb-2">
                  {product.volume && (
                    <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium mr-2">
                      {product.volume}
                    </span>
                  )}
                </div>
                <h1 className="font-playfair text-2xl md:text-3xl font-bold mb-3">{product.name}</h1>
                
                {/* Seller information */}
                <div className="flex items-center mb-4 text-sm bg-gray-50 p-3 rounded-md">
                  <div className="flex-1">
                    <p className="font-medium">Seller: {product.seller?.username}</p>
                    <p className="text-gray-500 text-xs">Trusted Seller</p>
                  </div>
                  <div className="flex gap-2">
                    <ContactSellerButton 
                      sellerId={product.sellerId}
                      sellerName={product.seller?.username || 'Seller'}
                      sellerImage={product.seller?.profileImage || null}
                      productId={product.id}
                      productName={product.name}
                      size="sm"
                      variant="secondary"
                    />
                    <Button variant="outline" className="text-xs h-8" asChild>
                      <Link href={`/sellers/${product.seller?.id}`}>View Seller</Link>
                    </Button>
                  </div>
                </div>
                
                <div className="text-2xl font-semibold mb-4">RM {product.price.toFixed(2)}</div>
                
                <div className="bg-gray-50 p-4 rounded-md mb-6">
                  <h3 className="font-medium mb-2 text-sm">Item Details:</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center">
                      <span className="text-gray-600 mr-2">Bottle:</span>
                      <span className="font-medium">{product.remainingPercentage || 100}% Full</span>
                    </div>
                    {product.purchaseYear && (
                      <div className="flex items-center">
                        <span className="text-gray-600 mr-2">Year:</span>
                        <span className="font-medium">{product.purchaseYear}</span>
                      </div>
                    )}
                    {product.boxCondition && (
                      <div className="flex items-center">
                        <span className="text-gray-600 mr-2">Box:</span>
                        <span className="font-medium">{product.boxCondition}</span>
                      </div>
                    )}
                    {product.batchCode && (
                      <div className="flex items-center">
                        <span className="text-gray-600 mr-2">Batch:</span>
                        <span className="font-medium">{product.batchCode}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <p className="text-gray-600 mb-6">
                  {product.description}
                </p>
              </div>
              
              {/* Contact seller button */}
              <div className="flex mb-8">
                <ContactSellerButton 
                  className="h-12 flex-grow shadow-sm"
                  sellerId={product.sellerId}
                  sellerName={product.seller?.username || 'Seller'}
                  sellerImage={product.seller?.profileImage || null}
                  productId={product.id}
                  productName={product.name}
                  variant="default"
                />
              </div>
              
              {/* Product meta */}
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-start">
                  <Info className="h-4 w-4 mr-2 mt-0.5" />
                  <div>
                    <span className="font-medium">Category:</span> {product.category?.name}
                  </div>
                </div>
                <div className="flex items-start">
                  <Info className="h-4 w-4 mr-2 mt-0.5" />
                  <div>
                    <span className="font-medium">Brand:</span> {product.brand}
                  </div>
                </div>
                <div className="flex items-start">
                  <Info className="h-4 w-4 mr-2 mt-0.5" />
                  <div>
                    <span className="font-medium">Availability:</span> {product.stockQuantity > 0 ? (
                      <span className="text-green-600">In Stock ({product.stockQuantity} available)</span>
                    ) : (
                      <span className="text-red-600">Out of Stock</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Product details tabs */}
          <div className="mt-16">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="description">Description</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
              
              <TabsContent value="description" className="p-6 bg-white rounded-lg shadow mt-6">
                <h3 className="font-playfair text-xl font-semibold mb-4">About {product.name}</h3>
                <p className="text-gray-600 mb-6">
                  {product.description || "No description available for this product."}
                </p>
              </TabsContent>
              
              <TabsContent value="details" className="p-6 bg-white rounded-lg shadow mt-6">
                <h3 className="font-playfair text-xl font-semibold mb-4">Pre-owned Details</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-1">Original Purchase:</h4>
                    <p className="text-gray-600">{product.purchaseYear || "Unknown"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Bottle Condition:</h4>
                    <p className="text-gray-600">{product.remainingPercentage || 100}% Full</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Box Condition:</h4>
                    <p className="text-gray-600">{product.boxCondition || "Not specified"}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Authenticity:</h4>
                    <p className="text-gray-600">
                      {product.batchCode ? (
                        <span className="flex items-center">
                          <span className="mr-1">Batch Code:</span> 
                          <span className="font-medium">{product.batchCode}</span>
                        </span>
                      ) : (
                        "No batch code provided"
                      )}
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}