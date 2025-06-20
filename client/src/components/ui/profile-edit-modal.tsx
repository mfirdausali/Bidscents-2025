import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Define schema for profile editing fields
const profileFormSchema = z.object({
  shopName: z.string().max(50, "Shop name must be 50 characters or less").optional(),
  location: z.string().max(100, "Location must be 100 characters or less").optional(),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: {
    id: number;
    shopName?: string | null;
    location?: string | null;
    bio?: string | null;
  };
  onSuccess: () => void;
}

export function ProfileEditModal({ isOpen, onClose, userData, onSuccess }: ProfileEditModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Set up form with default values from user data
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      shopName: userData.shopName || "",
      location: userData.location || "",
      bio: userData.bio || "",
    },
  });

  // Set up mutation for updating profile
  const updateProfileMutation = useMutation({
    mutationFn: async (formData: ProfileFormValues) => {
      const response = await apiRequest("PATCH", `/api/user/${userData.id}`, formData);
      return response;
    },
    onSuccess: () => {
      // Invalidate relevant queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: [`/api/sellers/${userData.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      
      toast({
        title: "Profile updated",
        description: "Your profile information has been successfully updated.",
      });
      
      onSuccess();
      onClose();
    },
    onError: (error) => {
      console.error("Error updating profile:", error);
      toast({
        title: "Error updating profile",
        description: "There was a problem updating your profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your seller profile information. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="shopName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shop Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter your shop name" 
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter your location" 
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>About / Bio</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Tell buyers about yourself and your shop" 
                      className="resize-none min-h-[120px]" 
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose} 
                disabled={updateProfileMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}