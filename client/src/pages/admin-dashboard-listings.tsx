import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, TableBody, TableCaption, TableCell, 
  TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { XCircle, MessageSquare } from "lucide-react";
import { ProductWithDetails } from "@shared/schema";

interface ListingsTabProps {
  products: ProductWithDetails[];
  handleRemoveListing: (product: ProductWithDetails) => void;
  handleMessageUser: (user: any) => void;
}

export function ListingsTab({ products, handleRemoveListing, handleMessageUser }: ListingsTabProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableCaption>A list of all product listings.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>#{product.id}</TableCell>
                <TableCell className="flex items-center gap-2">
                  {product.imageUrl && (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name} 
                      className="w-12 h-12 object-cover rounded-md"
                    />
                  )}
                  <span className="font-medium">{product.name}</span>
                </TableCell>
                <TableCell>{product.brand}</TableCell>
                <TableCell>${product.price.toFixed(2)}</TableCell>
                <TableCell>
                  {product.seller?.username || `User #${product.sellerId}`}
                </TableCell>
                <TableCell>
                  {!product.isDeleted ? (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Active</span>
                  ) : (
                    <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs">Inactive</span>
                  )}
                  {product.isFeatured && product.featuredUntil && new Date(product.featuredUntil) > new Date() && (
                    <span className="ml-2 bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">Featured</span>
                  )}
                </TableCell>
                <TableCell className="space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveListing(product)}
                    className="text-red-600"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                  {product.seller && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMessageUser(product.seller!)}
                      className="text-blue-600"
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Contact Seller
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}