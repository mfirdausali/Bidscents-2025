import React from 'react';
import { Helmet } from 'react-helmet';

interface MetaTagsProps {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  shopName?: string;
  location?: string;
}

/**
 * A component for setting SEO-friendly meta tags including Open Graph and Twitter Cards
 * to ensure good appearance when shared on social media platforms.
 */
export const MetaTags = ({
  title,
  description,
  image,
  url,
  type = 'website',
  twitterCard = 'summary_large_image',
  shopName,
  location
}: MetaTagsProps) => {
  // Fall back to site URL if specific page URL is not provided
  const pageUrl = url || typeof window !== 'undefined' ? window.location.href : '';
  
  // Add shop name to the title if available
  const fullTitle = shopName 
    ? `${shopName} - Perfume Shop on BidScents` 
    : title;
  
  // Add location to description if available
  const fullDescription = location 
    ? `${description} Located in ${location}.` 
    : description;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      
      {/* Open Graph Meta Tags (Facebook, WhatsApp) */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:type" content={type} />
      {pageUrl && <meta property="og:url" content={pageUrl} />}
      {image && <meta property="og:image" content={image} />}
      <meta property="og:site_name" content="BidScents" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      {image && <meta name="twitter:image" content={image} />}
      
      {/* Additional Meta Tags for Rich Preview */}
      <meta property="og:locale" content="en_US" />
      {location && <meta property="og:locale:alternate" content={`en_${location.split(',')[0]}`} />}
      {shopName && <meta property="profile:username" content={shopName} />}
      {shopName && <meta property="og:profile:username" content={shopName} />}
      
      {/* Article Specific Tags if type is article */}
      {type === 'article' && (
        <>
          <meta property="article:publisher" content="https://bidscents.com" />
          <meta property="article:modified_time" content={new Date().toISOString()} />
        </>
      )}
    </Helmet>
  );
};