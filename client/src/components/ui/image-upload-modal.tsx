import { useState, useRef, ChangeEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  imageType: "avatar" | "cover";
  onSuccess: () => void;
}

export function ImageUploadModal({ isOpen, onClose, userId, imageType, onSuccess }: ImageUploadModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const form = useForm({
    resolver: zodResolver(
      z.object({
        image: z.instanceof(File, { message: "Please select an image" })
      })
    ),
    defaultValues: {
      image: undefined
    }
  });
  
  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPEG, PNG, etc.)",
        variant: "destructive"
      });
      return;
    }
    
    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive"
      });
      return;
    }
    
    setSelectedImage(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Clear selected image
  const clearImage = () => {
    setSelectedImage(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Upload image mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedImage) throw new Error("No image selected");
      
      const formData = new FormData();
      formData.append('image', selectedImage);
      
      const endpoint = imageType === 'avatar' 
        ? `/api/user/avatar` 
        : `/api/user/cover`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload image");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload successful",
        description: imageType === 'avatar' 
          ? "Your profile photo has been updated" 
          : "Your cover photo has been updated",
      });
      
      // Invalidate queries to update UI
      queryClient.invalidateQueries({ queryKey: ["/api/sellers", userId] });
      
      // Clear form and close modal
      clearImage();
      onSuccess();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "There was an error uploading your image",
        variant: "destructive"
      });
    }
  });
  
  // Handle form submission
  const onSubmit = () => {
    if (!selectedImage) {
      toast({
        title: "No image selected",
        description: "Please select an image to upload",
        variant: "destructive"
      });
      return;
    }
    
    uploadMutation.mutate();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {imageType === 'avatar' ? 'Upload Profile Photo' : 'Upload Cover Photo'}
          </DialogTitle>
          <DialogDescription>
            {imageType === 'avatar' 
              ? 'Upload a profile photo to personalize your seller profile.'
              : 'Upload a cover photo to showcase your brand on your seller profile.'}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form className="space-y-6 py-2">
            <div className="flex flex-col items-center justify-center">
              {/* Image preview */}
              {previewUrl ? (
                <div className="relative">
                  <img 
                    src={previewUrl} 
                    alt="Preview" 
                    className={imageType === 'avatar' 
                      ? "w-48 h-48 rounded-lg object-cover border"
                      : "w-full h-32 rounded-lg object-cover border"
                    } 
                  />
                  <Button 
                    size="icon" 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    type="button"
                    onClick={clearImage}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className={`
                  flex flex-col items-center justify-center border-2 border-dashed 
                  border-gray-300 rounded-lg cursor-pointer bg-gray-50 
                  hover:bg-gray-100 transition-colors
                  ${imageType === 'avatar' ? 'w-48 h-48' : 'w-full h-32'}
                `}
                onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-10 w-10 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">
                    {imageType === 'avatar' 
                      ? 'Click to upload profile photo'
                      : 'Click to upload cover photo'
                    }
                  </p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF up to 5MB</p>
                </div>
              )}
              
              {/* Hidden file input */}
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange}
              />
              
              {/* File selection button */}
              {!previewUrl && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Select Image
                </Button>
              )}
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose} 
                disabled={uploadMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                onClick={onSubmit} 
                disabled={!selectedImage || uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}