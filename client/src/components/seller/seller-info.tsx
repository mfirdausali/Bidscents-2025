import { 
  Calendar, 
  GraduationCap, 
  Star, 
  ThumbsUp, 
  Droplets, 
  Wind, 
  Zap,
  Award
} from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface SellerInfoProps {
  seller: {
    joinDate?: string;
    createdAt?: string | Date;
    responseRate?: number;
    responseTime?: string;
    rating?: number;
    totalSales?: number;
    specialties?: string[];
    fragrance_families?: string[];
    experience?: string;
    stats?: {
      productCount?: number;
      averageRating?: number;
      totalSales?: number;
      joinDate?: string;
    };
  };
}

export default function SellerInfo({ seller }: SellerInfoProps) {
  const specialties = seller.specialties || [];
  const fragranceFamilies = seller.fragrance_families || [];
  const stats = seller.stats || {};
  
  // Format join date from either source
  const formatJoinDate = (date?: string | Date) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
  };
  
  const joinDate = seller.joinDate || stats.joinDate || (seller.createdAt ? formatJoinDate(seller.createdAt) : "N/A");
  const rating = seller.rating || stats.averageRating;
  const totalSales = seller.totalSales || stats.totalSales;
  
  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <CardTitle className="mb-4 text-lg font-semibold">Seller Information</CardTitle>
        
        <div className="space-y-4">
          {/* Join Date */}
          <div className="flex items-center text-sm">
            <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Member since:</span>
            <span className="ml-auto">
              {joinDate}
            </span>
          </div>
          
          {/* Products Listed */}
          {stats.productCount !== undefined && (
            <div className="flex items-center text-sm">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="mr-2 h-4 w-4 text-muted-foreground"
              >
                <path d="M10 22v-8H3a10 10 0 0 1 7-9.9" />
                <path d="M14 22v-8h7a10 10 0 0 0-7-9.9" />
                <rect x="9" y="2" width="6" height="5" rx="2.5" />
              </svg>
              <span className="text-muted-foreground">Perfumes Listed:</span>
              <span className="ml-auto">
                {stats.productCount}
              </span>
            </div>
          )}
          
          {/* Experience */}
          {seller.experience && (
            <div className="flex items-center text-sm">
              <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Experience:</span>
              <span className="ml-auto">
                {seller.experience}
              </span>
            </div>
          )}
          
          {/* Rating */}
          {rating !== undefined && (
            <div className="flex items-center text-sm">
              <Star className="mr-2 h-4 w-4 text-amber-400" />
              <span className="text-muted-foreground">Rating:</span>
              <span className="ml-auto flex items-center">
                <span className="mr-1 font-medium">{Number(rating).toFixed(1)}</span>
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star 
                      key={i} 
                      className={`h-3.5 w-3.5 ${
                        i < Math.floor(Number(rating)) 
                          ? "fill-amber-400 text-amber-400" 
                          : i < Number(rating)
                            ? "fill-amber-400/50 text-amber-400/50" 
                            : "fill-muted text-muted"
                      }`} 
                    />
                  ))}
                </div>
              </span>
            </div>
          )}
          
          {/* Response Rate */}
          {seller.responseRate && (
            <div className="flex items-center text-sm">
              <ThumbsUp className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Response Rate:</span>
              <span className="ml-auto">
                {seller.responseRate}%
              </span>
            </div>
          )}
          
          {/* Response Time */}
          {seller.responseTime && (
            <div className="flex items-center text-sm">
              <Zap className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Response Time:</span>
              <span className="ml-auto">
                {seller.responseTime}
              </span>
            </div>
          )}
          
          {/* Total Sales */}
          {totalSales !== undefined && (
            <div className="flex items-center text-sm">
              <Award className="mr-2 h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Total Sales:</span>
              <span className="ml-auto">
                {totalSales}
              </span>
            </div>
          )}
          
          <Separator className="my-4" />
          
          {/* Specialties */}
          {specialties.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center text-sm font-medium">
                <Droplets className="mr-2 h-4 w-4" />
                <span>Specialties</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {specialties.map((specialty, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {specialty}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {/* Fragrance Families */}
          {fragranceFamilies.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center text-sm font-medium">
                <Wind className="mr-2 h-4 w-4" />
                <span>Fragrance Families</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fragranceFamilies.map((family, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {family}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}