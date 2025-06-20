import Link from "next/link"
import Image from "next/image"
import { Star } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"

interface ProductProps {
  product: {
    id: string
    name: string
    price: number
    image: string
    rating: string
    reviewCount: number
    category: string
    inStock: boolean
  }
}

export function ProductCard({ product }: ProductProps) {
  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <Link href={`#${product.id}`}>
          <div className="aspect-square overflow-hidden">
            <Image
              src={product.image || "/placeholder.svg"}
              alt={product.name}
              width={300}
              height={300}
              className="h-full w-full object-cover transition-transform hover:scale-105"
            />
          </div>
        </Link>
        {!product.inStock && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Badge variant="outline" className="text-base font-semibold">
              Out of Stock
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-4">
        <div className="space-y-1">
          <Link href={`#${product.id}`} className="font-medium hover:underline">
            {product.name}
          </Link>
          <p className="font-bold">${product.price.toFixed(2)}</p>
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-primary text-primary" />
            <span className="text-sm">{product.rating}</span>
            <span className="text-xs text-muted-foreground">({product.reviewCount})</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full" disabled={!product.inStock}>
          Add to Cart
        </Button>
      </CardFooter>
    </Card>
  )
}
