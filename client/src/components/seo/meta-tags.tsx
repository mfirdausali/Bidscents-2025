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
  jsonLd?: Record<string, any>; // Add support for structured data
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
  location,
  jsonLd
}: MetaTagsProps) => {
  // Fall back to site URL if specific page URL is not provided
  const pageUrl = url || typeof window !== 'undefined' ? window.location.href : 'https://bidscents.replit.app';
  
  // Add shop name to the title if available
  const fullTitle = shopName 
    ? `${shopName} - Perfume Shop on BidScents` 
    : title;
  
  // Add location to description if available
  const fullDescription = location && location.trim() !== ''
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
      <meta property="og:url" content={pageUrl} />
      {image && <meta property="og:image" content={image} />}
      {/* The next line is particularly important for WhatsApp */}
      {image && <meta property="og:image:secure_url" content={image} />}
      {image && <meta property="og:image:type" content="image/jpeg" />}
      {image && <meta property="og:image:width" content="1200" />}
      {image && <meta property="og:image:height" content="630" />}
      <meta property="og:site_name" content="BidScents" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      {image && <meta name="twitter:image" content={image} />}
      <meta name="twitter:site" content="@bidscents" />
      
      {/* Additional Meta Tags for Rich Preview */}
      <meta property="og:locale" content="en_US" />
      {location && location.trim() !== '' && <meta property="og:locale:alternate" content={`en_${location.split(',')[0]}`} />}
      {shopName && <meta property="profile:username" content={shopName} />}
      {shopName && <meta property="og:profile:username" content={shopName} />}
      
      {/* WhatsApp specific meta tags */}
      <meta property="al:ios:url" content={pageUrl} />
      <meta property="al:ios:app_store_id" content="bidscents" />
      <meta property="al:ios:app_name" content="BidScents" />
      <meta property="al:android:url" content={pageUrl} />
      <meta property="al:android:app_name" content="BidScents" />
      <meta property="al:android:package" content="com.bidscents.app" />
      <meta property="al:web:url" content={pageUrl} />
      
      {/* Article Specific Tags if type is article */}
      {type === 'article' && (
        <>
          <meta property="article:publisher" content="https://bidscents.replit.app" />
          <meta property="article:modified_time" content={new Date().toISOString()} />
        </>
      )}
      
      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};