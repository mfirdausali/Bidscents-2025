import { useState } from "react";
import { Link } from "wouter";
import { 
  MessageSquare, 
  Share2, 
  Heart, 
  Bell, 
  BellOff,
  CheckCircle,
  ExternalLink 
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

interface SellerHeaderProps {
  seller: {
    id: number;
    username: string;
    profileImage: string | null;
    coverImage?: string | null;
    location?: string | null;
    isVerified?: boolean;
    followerCount?: number;
    website?: string | null;
    joinedDate?: string | Date;
  };
  isFollowing?: boolean;
  onFollowToggle?: () => void;
}

export function SellerHeader({ 
  seller, 
  isFollowing = false, 
  onFollowToggle 
}: SellerHeaderProps) {
  const [isFollowingState, setIsFollowingState] = useState(isFollowing);
  const { toast } = useToast();
  
  const {
    id,
    username,
    profileImage,
    coverImage,
    location,
    isVerified,
    followerCount,
    website,
    joinedDate
  } = seller;
  
  const defaultCoverImage = "/images/default-cover.jpg";
  const defaultProfileImage = "/images/default-avatar.jpg";
  
  const handleFollowToggle = () => {
    // If parent doesn't provide a handler, handle it locally
    if (!onFollowToggle) {
      setIsFollowingState(!isFollowingState);
      toast({
        title: isFollowingState ? "Unfollowed" : "Following",
        description: isFollowingState 
          ? `You are no longer following ${username}`
          : `You are now following ${username}`,
        duration: 3000
      });
    } else {
      onFollowToggle();
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${username}'s Perfume Collection`,
        text: `Check out ${username}'s perfume collection on BidLelong!`,
        url: window.location.href
      })
      .catch(error => console.error("Error sharing:", error));
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied!",
        description: "Seller profile link copied to clipboard",
        duration: 3000
      });
    }
  };

  return (
    <div className="w-full">
      {/* Cover Image */}
      <div className="relative h-48 w-full overflow-hidden bg-muted sm:h-64 md:h-80">
        <img
          src={coverImage || defaultCoverImage}
          alt={`${username}'s cover`}
          className="h-full w-full object-cover"
        />
        
        {/* Actions Menu - Desktop */}
        <div className="absolute right-4 top-4 hidden space-x-2 sm:flex">
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-background/80 backdrop-blur-sm"
            onClick={handleShare}
          >
            <Share2 className="mr-1 h-4 w-4" />
            Share
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-background/80 backdrop-blur-sm"
          >
            <MessageSquare className="mr-1 h-4 w-4" />
            Message
          </Button>
        </div>
      </div>
      
      <div className="relative border-b bg-background px-4 pb-4 pt-0 sm:px-6 md:px-8">
        {/* Profile Image */}
        <div className="absolute -top-16 left-4 h-32 w-32 overflow-hidden rounded-full border-4 border-background bg-background sm:-top-20 sm:h-40 sm:w-40 md:left-8">
          <img
            src={profileImage || defaultProfileImage}
            alt={username}
            className="h-full w-full object-cover"
          />
        </div>
        
        {/* Seller Info */}
        <div className="flex flex-col pt-20 sm:ml-44 sm:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold sm:text-3xl">{username}</h1>
                {isVerified && (
                  <CheckCircle className="h-5 w-5 fill-primary text-background" />
                )}
              </div>
              
              {location && (
                <p className="text-sm text-muted-foreground">{location}</p>
              )}
            </div>
            
            <div className="flex space-x-2">
              {isFollowingState ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleFollowToggle}
                  className="hidden sm:flex"
                >
                  <BellOff className="mr-1 h-4 w-4" />
                  Unfollow
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  onClick={handleFollowToggle}
                  className="hidden sm:flex"
                >
                  <Bell className="mr-1 h-4 w-4" />
                  Follow
                </Button>
              )}
              
              <Button
                variant={isFollowingState ? "outline" : "default"}
                size="sm"
                onClick={handleFollowToggle}
                className="sm:hidden"
              >
                {isFollowingState ? (
                  <BellOff className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="sm:hidden"
              >
                <Share2 className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="sm:hidden"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* Stats */}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {typeof followerCount === 'number' && (
              <div className="flex items-center gap-1">
                <Heart className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  <strong>{followerCount}</strong> 
                  <span className="text-muted-foreground"> followers</span>
                </span>
              </div>
            )}
            
            {website && (
              <div className="flex items-center gap-1">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <a 
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            
            {joinedDate && (
              <div className="text-sm text-muted-foreground">
                Joined {new Date(joinedDate).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long' 
                })}
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile Follow Button */}
        <div className="mb-4 mt-4 sm:hidden">
          {isFollowingState ? (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleFollowToggle}
            >
              <BellOff className="mr-1 h-4 w-4" />
              Unfollow
            </Button>
          ) : (
            <Button 
              className="w-full"
              onClick={handleFollowToggle}
            >
              <Bell className="mr-1 h-4 w-4" />
              Follow
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}