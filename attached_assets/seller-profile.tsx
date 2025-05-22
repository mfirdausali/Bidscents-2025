"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  MessageSquare,
  Star,
  Store,f
  ThumbsUp,
  Truck,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProductCard } from "@/components/product-card"
import { ProductFilters } from "@/components/product-filters"

// Mock data for the seller
const sellerData = {
  id: "123",
  name: "Tech Gadgets Store",
  image: "/placeholder.svg?height=128&width=128",
  coverImage: "/placeholder.svg?height=300&width=1200",
  rating: 4.8,
  reviewCount: 1243,
  followers: 5678,
  joinDate: "January 2020",
  location: "New York, USA",
  responseRate: "98%",
  responseTime: "within 24 hours",
  description:
    "We specialize in the latest tech gadgets and accessories. Our store offers high-quality products at competitive prices with excellent customer service.",
  badges: ["Verified Seller", "Top Rated", "Fast Shipper"],
  stats: {
    productsCount: 156,
    totalSales: 12543,
    satisfactionRate: "96%",
  },
}

// Generate product images with different colors
const productImages = [
  "/placeholder.svg?height=300&width=300&text=Headphones",
  "/placeholder.svg?height=300&width=300&text=Smartwatch",
  "/placeholder.svg?height=300&width=300&text=Speaker",
  "/placeholder.svg?height=300&width=300&text=Laptop",
  "/placeholder.svg?height=300&width=300&text=Camera",
  "/placeholder.svg?height=300&width=300&text=Phone",
]

// Product names
const productNames = [
  "Ultra Wireless Headphones",
  "SmartLife Watch Pro",
  "SoundMax Bluetooth Speaker",
  "PowerBook Ultra Slim",
  "PixelPro Digital Camera",
  "Galaxy X Phone",
  "Noise Cancelling Earbuds",
  "Smart Home Hub",
  "Portable Power Bank",
  "Wireless Charging Pad",
  "Gaming Controller Pro",
  "Virtual Reality Headset",
]

// Mock data for products
const mockProducts = Array(24)
  .fill(null)
  .map((_, i) => ({
    id: `product-${i + 1}`,
    name: productNames[i % productNames.length],
    price: Math.floor(Math.random() * 200) + 10,
    image: productImages[i % productImages.length],
    rating: (Math.random() * 2 + 3).toFixed(1),
    reviewCount: Math.floor(Math.random() * 500),
    category: i % 3 === 0 ? "Electronics" : i % 3 === 1 ? "Accessories" : "Gadgets",
    inStock: Math.random() > 0.2,
  }))

export function SellerProfile({ sellerId }: { sellerId: string }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTab, setActiveTab] = useState("all")
  const [sortOption, setSortOption] = useState("popular")

  const productsPerPage = 12

  // Filter products based on active tab
  const filteredProducts =
    activeTab === "all"
      ? mockProducts
      : mockProducts.filter((product) => product.category.toLowerCase() === activeTab.toLowerCase())

  // Sort products based on sort option
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortOption === "price-low") return a.price - b.price
    if (sortOption === "price-high") return b.price - a.price
    if (sortOption === "rating") return Number.parseFloat(b.rating) - Number.parseFloat(a.rating)
    // Default: popular (by review count)
    return b.reviewCount - a.reviewCount
  })

  // Paginate products
  const indexOfLastProduct = currentPage * productsPerPage
  const indexOfFirstProduct = indexOfLastProduct - productsPerPage
  const currentProducts = sortedProducts.slice(indexOfFirstProduct, indexOfLastProduct)
  const totalPages = Math.ceil(sortedProducts.length / productsPerPage)

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber)
    // Scroll to top of product section
    document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Cover Image and Profile Section */}
      <div className="relative mb-8">
        <div className="h-48 md:h-64 w-full rounded-lg overflow-hidden">
          <Image
            src={sellerData.coverImage || "/placeholder.svg"}
            alt={`${sellerData.name} cover`}
            width={1200}
            height={300}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-col md:flex-row gap-6 mt-4 md:mt-0 md:items-end md:absolute md:bottom-0 md:translate-y-1/2 md:left-8">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden border-4 border-background bg-background">
            <Image
              src={sellerData.image || "/placeholder.svg"}
              alt={sellerData.name}
              width={128}
              height={128}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="md:mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-bold">{sellerData.name}</h1>
              {sellerData.badges.map((badge, index) => (
                <Badge key={index} variant="secondary" className="hidden md:inline-flex">
                  {badge}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center">
                <Star className="h-4 w-4 fill-primary text-primary" />
                <span className="ml-1 font-medium">{sellerData.rating}</span>
              </div>
              <span className="text-muted-foreground">({sellerData.reviewCount} reviews)</span>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-center">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="ml-1 text-muted-foreground">{sellerData.followers} followers</span>
              </div>
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
          {sellerData.badges.map((badge, index) => (
            <Badge key={index} variant="secondary">
              {badge}
            </Badge>
          ))}
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
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Store className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Products</p>
                  <p className="text-muted-foreground">{sellerData.stats.productsCount} items</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Location</p>
                  <p className="text-muted-foreground">{sellerData.location}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Member Since</p>
                  <p className="text-muted-foreground">{sellerData.joinDate}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <ThumbsUp className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Satisfaction Rate</p>
                  <p className="text-muted-foreground">{sellerData.stats.satisfactionRate}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Truck className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Shipping</p>
                  <p className="text-muted-foreground">Fast & Reliable</p>
                </div>
              </div>

              <Separator />

              <div>
                <p className="font-medium mb-2">About</p>
                <p className="text-muted-foreground text-sm">{sellerData.description}</p>
              </div>

              <div className="pt-2">
                <Link href="#" className="text-sm flex items-center text-primary hover:underline">
                  Visit website
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Products Section */}
        <div className="lg:col-span-3" id="products-section">
          <Tabs
            defaultValue="all"
            onValueChange={(value) => {
              setActiveTab(value)
              setCurrentPage(1)
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <TabsList>
                <TabsTrigger value="all">All Products</TabsTrigger>
                <TabsTrigger value="electronics">Electronics</TabsTrigger>
                <TabsTrigger value="accessories">Accessories</TabsTrigger>
                <TabsTrigger value="gadgets">Gadgets</TabsTrigger>
              </TabsList>

              <ProductFilters sortOption={sortOption} onSortChange={(value) => setSortOption(value)} />
            </div>

            <TabsContent value="all" className="mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="electronics" className="mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="accessories" className="mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="gadgets" className="mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Pagination */}
          {totalPages > 1 && (
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

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  // Show first page, last page, current page, and pages around current
                  const shouldShow = page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1

                  if (!shouldShow && (page === 2 || page === totalPages - 1)) {
                    return (
                      <span key={page} className="flex h-9 w-9 items-center justify-center">
                        ...
                      </span>
                    )
                  }

                  if (!shouldShow) return null

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
                  )
                })}

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
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
  )
}
