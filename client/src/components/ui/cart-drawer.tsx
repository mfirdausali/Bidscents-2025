import { useState, useEffect, useRef } from "react";
import { Button } from "./button";
import { X, Trash2, Plus, Minus } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CartItemWithProduct } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-supabase-auth";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "./separator";
import { Badge } from "./badge";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { user, setCartCount } = useAuth();
  const { toast } = useToast();
  const drawerRef = useRef<HTMLDivElement>(null);

  const [subtotal, setSubtotal] = useState(0);

  const { data: cartItems, isLoading } = useQuery<CartItemWithProduct[]>({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  // Calculate subtotal when cart items change
  useEffect(() => {
    if (cartItems) {
      const total = cartItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0
      );
      setSubtotal(total);
      setCartCount(cartItems.length);
    }
  }, [cartItems, setCartCount]);

  // Update cart item quantity
  const updateCartItemMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      await apiRequest("PUT", `/api/cart/${id}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error) => {
      toast({
        title: "Error updating cart",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remove item from cart
  const removeCartItemMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cart/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Item removed",
        description: "Item has been removed from your cart",
      });
    },
    onError: (error) => {
      toast({
        title: "Error removing item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle quantity change
  const handleQuantityChange = (id: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateCartItemMutation.mutate({ id, quantity: newQuantity });
  };

  // Handle outside click to close drawer
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node) && isOpen) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Prevent scrolling when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 h-full w-[350px] md:w-[400px] bg-white shadow-lg flex flex-col transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="font-playfair text-xl font-semibold">
              Your Cart {cartItems && cartItems.length > 0 && `(${cartItems.length})`}
            </h3>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
            </div>
          ) : !user ? (
            <div className="text-center py-8">
              <p className="mb-4">Please log in to view your cart</p>
              <Button onClick={onClose}>Continue Shopping</Button>
            </div>
          ) : cartItems && cartItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="mb-4">Your cart is empty</p>
              <Button onClick={onClose}>Continue Shopping</Button>
            </div>
          ) : (
            cartItems &&
            cartItems.map((item) => (
              <div key={item.id} className="flex border-b border-gray-200 pb-4 mb-4">
                <div className="w-20 h-20 rounded overflow-hidden bg-gray-100">
                  <img
                    src={item.product.imageUrl}
                    alt={item.product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="ml-4 flex-grow">
                  <div className="flex justify-between">
                    <div>
                      <div className="text-sm text-gray-500">{item.product.brand}</div>
                      <h4 className="font-medium">{item.product.name}</h4>
                      {item.product.isNew && (
                        <Badge className="bg-gold text-rich-black mt-1">New</Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-red-500"
                      onClick={() => removeCartItemMutation.mutate(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <div className="flex border rounded">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 p-0"
                        onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <input
                        type="text"
                        value={item.quantity}
                        readOnly
                        className="w-8 text-center text-sm py-0.5"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 p-0"
                        onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="font-medium">${item.product.price.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {user && cartItems && cartItems.length > 0 && (
          <div className="p-6 border-t border-gray-200">
            <div className="flex justify-between mb-2">
              <span>Subtotal</span>
              <span className="font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mb-4 text-gray-500 text-sm">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <Separator className="my-4" />
            <Button className="w-full bg-rich-black text-white hover:bg-metallic-gold hover:text-rich-black mb-3 py-6 rounded-full">
              Checkout Now
            </Button>
            <Button
              variant="outline"
              className="w-full border-gray-300 text-dark-grey hover:bg-gray-100 py-6 rounded-full"
              onClick={onClose}
            >
              Continue Shopping
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
