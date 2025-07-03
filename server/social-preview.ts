/**
 * Social preview handler module
 * This module provides server-side rendered preview pages for social media platforms
 * that don't properly support client-side meta tags (like WhatsApp)
 */

import { Request, Response } from "express";
import { supabase } from "./supabase";
import { storage } from "./storage";

// Default values for social previews
const DEFAULT_TITLE = "BidScents - Preowned Fragrance Marketplace";
const DEFAULT_DESCRIPTION = "Explore authentic pre-owned luxury perfumes at incredible prices. The premier marketplace for secondhand perfumes in Malaysia.";
const DEFAULT_IMAGE_URL = `${process.env.APP_URL || 'https://bidscents.com'}/logo-social.svg`;
const BASE_URL = process.env.APP_URL || 'https://bidscents.com';

/**
 * Generate seller profile social preview HTML
 * This creates a full HTML document with appropriate meta tags for WhatsApp and other platforms
 */
export async function generateSellerPreview(req: Request, res: Response) {
  try {
    const sellerId = parseInt(req.params.id);
    
    if (isNaN(sellerId)) {
      return renderDefaultPreview(res);
    }
    
    // Fetch seller data
    const seller = await storage.getUser(sellerId);
    
    if (!seller) {
      return renderDefaultPreview(res);
    }
    
    // Check if seller is verified from Supabase (direct DB access)
    let isVerified = seller.isVerified || false;
    
    if (!isVerified) {
      try {
        const { data } = await supabase
          .from('users')
          .select('is_verified')
          .eq('id', sellerId)
          .single();
          
        isVerified = !!data?.is_verified;
      } catch (error) {
        console.error('Error checking verification status:', error);
      }
    }
    
    // Prepare seller data for preview
    const sellerName = seller.shopName || 
      (seller.firstName && seller.lastName ? `${seller.firstName} ${seller.lastName}'s Shop` : 
      seller.username);
      
    const sellerDescription = seller.bio || 
      `${sellerName} offers premium perfumes and fragrances. ${isVerified ? 'Verified seller with authentic products.' : ''}`;
    
    // Get image URL for the preview
    const imageUrl = seller.avatarUrl 
      ? `${BASE_URL}/api/images/${seller.avatarUrl}`
      : DEFAULT_IMAGE_URL;
    
    // The URL of the actual page
    const pageUrl = `${BASE_URL}/sellers/${sellerId}`;
    
    // Render the HTML with all necessary meta tags
    return res.send(generatePreviewHtml(
      `${sellerName} | BidScents Perfume Seller`,
      sellerDescription,
      imageUrl,
      pageUrl,
      seller.location
    ));
  } catch (error) {
    console.error('Error generating seller preview:', error);
    return renderDefaultPreview(res);
  }
}

/**
 * Generate auction social preview HTML
 * This creates a full HTML document with appropriate meta tags for auction pages
 */
export async function generateAuctionPreview(req: Request, res: Response) {
  try {
    const auctionId = parseInt(req.params.id);
    const userAgent = req.headers['user-agent'] || '';
    const isTelegram = userAgent.toLowerCase().includes('telegram');
    console.log(`[AUCTION-PREVIEW] Generating preview for auction ID: ${auctionId}, User-Agent: ${userAgent}, Is Telegram: ${isTelegram}`);
    
    if (isNaN(auctionId)) {
      console.log('[AUCTION-PREVIEW] Invalid auction ID, returning default preview');
      return renderDefaultPreview(res);
    }
    
    // Fetch auction data with product and seller information
    console.log(`[AUCTION-PREVIEW] Fetching auction data for ID: ${auctionId}`);
    const auction = await storage.getAuctionById(auctionId);
    
    if (!auction) {
      console.log('[AUCTION-PREVIEW] Auction not found, returning default preview');
      return renderDefaultPreview(res);
    }
    console.log(`[AUCTION-PREVIEW] Auction found:`, { id: auction.id, productId: auction.productId, status: auction.status });
    
    // Get product details
    console.log(`[AUCTION-PREVIEW] Fetching product data for ID: ${auction.productId}`);
    const product = await storage.getProductById(auction.productId);
    
    if (!product) {
      console.log('[AUCTION-PREVIEW] Product not found, returning default preview');
      return renderDefaultPreview(res);
    }
    console.log(`[AUCTION-PREVIEW] Product found:`, { id: product.id, name: product.name, brand: product.brand });
    
    // Get seller information
    console.log(`[AUCTION-PREVIEW] Fetching seller data for ID: ${product.sellerId}`);
    const seller = await storage.getUser(product.sellerId);
    console.log(`[AUCTION-PREVIEW] Seller found:`, seller ? { id: seller.id, username: seller.username } : 'No seller');
    
    // Prepare auction data for preview
    const title = `${product.name} - Auction by ${seller?.username || 'Seller'} | BidScents`;
    const currentBid = auction.currentBid || auction.startingPrice;
    // Telegram prefers shorter descriptions, limit to 155 chars
    const rawDescription = `Bid on ${product.name} by ${product.brand}. Current bid: RM ${currentBid.toFixed(2)}. ${product.description || 'Premium perfume available for auction.'}`;
    const description = rawDescription.replace(/\n/g, ' ').substring(0, 155).trim();
    
    // Get the main product image
    let imageUrl = DEFAULT_IMAGE_URL;
    console.log(`[AUCTION-PREVIEW] Processing images for product`);
    
    // First check for product images array
    const productImages = await storage.getProductImages(product.id);
    console.log(`[AUCTION-PREVIEW] Product images found: ${productImages?.length || 0}`);
    
    if (productImages && productImages.length > 0) {
      // Add query parameter to request optimized image for social media
      imageUrl = `${BASE_URL}/api/images/${productImages[0].imageUrl}?w=1200&h=630&q=80`;
      console.log(`[AUCTION-PREVIEW] Using optimized product image: ${imageUrl}`);
    } else if (product.imageUrl) {
      // Add query parameter to request optimized image for social media
      imageUrl = `${BASE_URL}/api/images/${product.imageUrl}?w=1200&h=630&q=80`;
      console.log(`[AUCTION-PREVIEW] Using optimized main product image: ${imageUrl}`);
    } else {
      console.log(`[AUCTION-PREVIEW] No images found, using default image`);
    }
    
    // The URL of the actual auction page
    const pageUrl = `${BASE_URL}/auctions/${auctionId}`;
    console.log(`[AUCTION-PREVIEW] Page URL: ${pageUrl}`);
    
    // Generate auction-specific structured data
    const structuredData = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.name,
      "description": product.description || 'Premium perfume available for auction',
      "brand": {
        "@type": "Brand",
        "name": product.brand
      },
      "image": imageUrl,
      "offers": {
        "@type": "AggregateOffer",
        "lowPrice": auction.startingPrice,
        "highPrice": currentBid,
        "priceCurrency": "MYR",
        "availability": auction.status === 'active' ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
        "priceValidUntil": auction.endsAt,
        "seller": seller ? {
          "@type": "Person",
          "name": seller.username || "Seller"
        } : undefined
      }
    };
    
    console.log(`[AUCTION-PREVIEW] Generating HTML preview with:`, {
      title,
      description: description.substring(0, 50) + '...',
      imageUrl,
      currentBid
    });
    
    // Special handling for Telegram - send simplified response
    if (isTelegram) {
      console.log('[AUCTION-PREVIEW] Generating simplified preview for Telegram');
      return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="BidScents">
  <link rel="canonical" href="${pageUrl}">
</head>
<body>
  <h1>${title}</h1>
  <img src="${imageUrl}" alt="${title}">
  <p>Current Bid: RM ${currentBid.toFixed(2)}</p>
  <p>${description}</p>
</body>
</html>`);
    }
    
    // Render the full HTML with all necessary meta tags for other platforms
    return res.send(generateAuctionPreviewHtml(
      title,
      description,
      imageUrl,
      pageUrl,
      seller?.username || "BidScents Seller",
      currentBid,
      structuredData,
      userAgent
    ));
  } catch (error) {
    console.error('[AUCTION-PREVIEW] Error generating auction preview:', error);
    return renderDefaultPreview(res);
  }
}

/**
 * Generate product social preview HTML
 * This creates a full HTML document with appropriate meta tags for product pages
 */
export async function generateProductPreview(req: Request, res: Response) {
  try {
    const productId = parseInt(req.params.id);
    console.log(`[PRODUCT-PREVIEW] Generating preview for product ID: ${productId}`);
    
    if (isNaN(productId)) {
      console.log('[PRODUCT-PREVIEW] Invalid product ID, returning default preview');
      return renderDefaultPreview(res);
    }
    
    // Fetch product data
    console.log(`[PRODUCT-PREVIEW] Fetching product data for ID: ${productId}`);
    const product = await storage.getProductById(productId);
    
    if (!product) {
      console.log('[PRODUCT-PREVIEW] Product not found, returning default preview');
      return renderDefaultPreview(res);
    }
    console.log(`[PRODUCT-PREVIEW] Product found:`, { id: product.id, name: product.name, brand: product.brand });
    
    // Get seller information
    console.log(`[PRODUCT-PREVIEW] Fetching seller data for ID: ${product.sellerId}`);
    const seller = await storage.getUser(product.sellerId);
    console.log(`[PRODUCT-PREVIEW] Seller found:`, seller ? { id: seller.id, username: seller.username } : 'No seller');
    
    // Prepare product data for preview
    const title = `${product.name} by ${product.brand}${product.volume ? ` - ${product.volume}` : ''} | BidScents`;
    const description = `${product.description || `Authentic ${product.name} perfume by ${product.brand}`}. ${product.remainingPercentage || 100}% full. Price: RM ${product.price.toFixed(2)}. Sold by ${seller?.username || 'verified seller'}.`.substring(0, 200);
    
    // Get the main product image
    let imageUrl = DEFAULT_IMAGE_URL;
    console.log(`[PRODUCT-PREVIEW] Processing images for product`);
    
    // First check for product images array
    const productImages = await storage.getProductImages(product.id);
    console.log(`[PRODUCT-PREVIEW] Product images found: ${productImages?.length || 0}`);
    
    if (productImages && productImages.length > 0) {
      // Add query parameter to request optimized image for social media
      imageUrl = `${BASE_URL}/api/images/${productImages[0].imageUrl}?w=1200&h=630&q=80`;
      console.log(`[PRODUCT-PREVIEW] Using optimized product image: ${imageUrl}`);
    } else if (product.imageUrl) {
      // Add query parameter to request optimized image for social media
      imageUrl = `${BASE_URL}/api/images/${product.imageUrl}?w=1200&h=630&q=80`;
      console.log(`[PRODUCT-PREVIEW] Using optimized main product image: ${imageUrl}`);
    } else {
      console.log(`[PRODUCT-PREVIEW] No images found, using default image`);
    }
    
    // The URL of the actual product page
    const pageUrl = `${BASE_URL}/products/${productId}`;
    console.log(`[PRODUCT-PREVIEW] Page URL: ${pageUrl}`);
    
    // Generate product-specific structured data
    const structuredData = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.name,
      "description": product.description || `${product.name} by ${product.brand}`,
      "brand": {
        "@type": "Brand",
        "name": product.brand
      },
      "image": imageUrl,
      "offers": {
        "@type": "Offer",
        "price": product.price,
        "priceCurrency": "MYR",
        "availability": product.isActive ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "itemCondition": product.isNew ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
        "seller": seller ? {
          "@type": "Person",
          "name": seller.username || "Seller"
        } : undefined
      },
      "additionalProperty": [
        {
          "@type": "PropertyValue",
          "name": "Volume",
          "value": product.volume || "N/A"
        },
        {
          "@type": "PropertyValue",
          "name": "Remaining",
          "value": `${product.remainingPercentage || 100}%`
        }
      ]
    };
    
    console.log(`[PRODUCT-PREVIEW] Generating HTML preview with:`, {
      title,
      description: description.substring(0, 50) + '...',
      imageUrl,
      price: product.price
    });
    
    // Render the HTML with all necessary meta tags
    return res.send(generateProductPreviewHtml(
      title,
      description,
      imageUrl,
      pageUrl,
      seller?.username || "BidScents Seller",
      product.price,
      product.volume || "",
      product.remainingPercentage || 100,
      product.isNew,
      structuredData
    ));
  } catch (error) {
    console.error('[PRODUCT-PREVIEW] Error generating product preview:', error);
    return renderDefaultPreview(res);
  }
}

/**
 * Generate HTML for default preview when specific content isn't available
 */
function renderDefaultPreview(res: Response) {
  return res.send(generatePreviewHtml(
    DEFAULT_TITLE,
    DEFAULT_DESCRIPTION,
    DEFAULT_IMAGE_URL,
    BASE_URL
  ));
}

/**
 * Generate a complete HTML document with all necessary meta tags
 * This ensures the preview works on all platforms including WhatsApp
 */
function generatePreviewHtml(
  title: string,
  description: string,
  imageUrl: string,
  pageUrl: string,
  location?: string | null
) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Standard meta tags -->
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="BidScents">
  
  <!-- WhatsApp specific -->
  <meta property="og:locale" content="en_US">
  ${location ? `<meta property="og:locale:alternate" content="en_${location.split(',')[0]}">` : ''}
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="twitter:site" content="@bidscents">
  
  <!-- Automatic redirect to the actual page after a delay to allow crawlers to parse -->
  <meta http-equiv="refresh" content="3;url=${pageUrl}">
  
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      text-align: center;
      line-height: 1.6;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 20px 0;
    }
    h1 {
      color: #7c3aed;
    }
    p {
      color: #4b5563;
    }
    .cta {
      display: inline-block;
      background-color: #7c3aed;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      text-decoration: none;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <img src="${imageUrl}" alt="${title}">
  <p>${description}</p>
  <a href="${pageUrl}" class="cta">View Profile</a>
  <p>Redirecting to BidScents...</p>
</body>
</html>`;
}

/**
 * Generate a complete HTML document for auction preview with all necessary meta tags
 * This ensures the preview works on all platforms including WhatsApp
 */
function generateAuctionPreviewHtml(
  title: string,
  description: string,
  imageUrl: string,
  pageUrl: string,
  sellerName: string,
  currentBid: number,
  structuredData: any,
  userAgent: string = ''
) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Standard meta tags -->
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${title}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="BidScents">
  
  <!-- Additional platform specific tags -->
  <meta property="og:locale" content="en_MY">
  <meta property="og:locale:alternate" content="en_US">
  
  <!-- Product specific Open Graph tags -->
  <meta property="product:price:amount" content="${currentBid.toFixed(2)}">
  <meta property="product:price:currency" content="MYR">
  <meta property="product:retailer_item_id" content="${pageUrl.split('/').pop()}">
  <meta property="product:availability" content="in stock">
  <meta property="product:condition" content="used">
  <meta property="product:seller" content="${sellerName}">
  
  <!-- Instagram/Facebook specific -->
  <meta property="instagram:price:amount" content="${currentBid.toFixed(2)}">
  <meta property="instagram:price:currency" content="MYR">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="twitter:site" content="@bidscents">
  <meta name="twitter:label1" content="Current Bid">
  <meta name="twitter:data1" content="RM ${currentBid.toFixed(2)}">
  <meta name="twitter:label2" content="Seller">
  <meta name="twitter:data2" content="${sellerName}">
  
  <!-- Additional platform optimizations -->
  <meta name="twitter:image:alt" content="${title}">
  <meta name="twitter:creator" content="@bidscents">
  
  <!-- Telegram specific -->
  <meta name="telegram:channel" content="@bidscents">
  
  <!-- Pinterest specific -->
  <meta property="pinterest:price" content="${currentBid.toFixed(2)}">
  <meta property="pinterest:currency" content="MYR">
  
  <!-- LinkedIn specific -->
  <meta property="article:author" content="${sellerName}">
  
  <!-- Structured Data -->
  <script type="application/ld+json">
    ${JSON.stringify(structuredData)}
  </script>
  
  <!-- Automatic redirect to the actual page after a delay to allow crawlers to parse -->
  <meta http-equiv="refresh" content="3;url=${pageUrl}">
  
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      text-align: center;
      line-height: 1.6;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 20px 0;
    }
    h1 {
      color: #7c3aed;
    }
    p {
      color: #4b5563;
    }
    .price {
      font-size: 24px;
      font-weight: bold;
      color: #10b981;
      margin: 10px 0;
    }
    .seller {
      color: #6b7280;
      font-size: 14px;
    }
    .cta {
      display: inline-block;
      background-color: #f59e0b;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      text-decoration: none;
      margin-top: 20px;
      font-weight: bold;
    }
    .cta:hover {
      background-color: #d97706;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <img src="${imageUrl}" alt="${title}">
  <p class="price">Current Bid: RM ${currentBid.toFixed(2)}</p>
  <p class="seller">Sold by ${sellerName}</p>
  <p>${description}</p>
  <a href="${pageUrl}" class="cta">Place Your Bid</a>
  <p>Redirecting to BidScents auction...</p>
</body>
</html>`;
}

/**
 * Generate a complete HTML document for product preview with all necessary meta tags
 * This ensures the preview works on all platforms including WhatsApp
 */
function generateProductPreviewHtml(
  title: string,
  description: string,
  imageUrl: string,
  pageUrl: string,
  sellerName: string,
  price: number,
  volume: string,
  remainingPercentage: number,
  isNew: boolean,
  structuredData: any
) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  
  <!-- Standard meta tags -->
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${title}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="BidScents">
  
  <!-- Additional platform specific tags -->
  <meta property="og:locale" content="en_MY">
  <meta property="og:locale:alternate" content="en_US">
  
  <!-- Product specific Open Graph tags -->
  <meta property="product:price:amount" content="${price.toFixed(2)}">
  <meta property="product:price:currency" content="MYR">
  <meta property="product:retailer_item_id" content="${pageUrl.split('/').pop()}">
  <meta property="product:availability" content="in stock">
  <meta property="product:condition" content="${isNew ? 'new' : 'used'}">
  <meta property="product:seller" content="${sellerName}">
  
  <!-- Instagram/Facebook specific -->
  <meta property="instagram:price:amount" content="${price.toFixed(2)}">
  <meta property="instagram:price:currency" content="MYR">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <meta name="twitter:site" content="@bidscents">
  <meta name="twitter:label1" content="Price">
  <meta name="twitter:data1" content="RM ${price.toFixed(2)}">
  <meta name="twitter:label2" content="Condition">
  <meta name="twitter:data2" content="${remainingPercentage}% Full${volume ? ` - ${volume}` : ''}">
  
  <!-- Additional platform optimizations -->
  <meta name="twitter:image:alt" content="${title}">
  <meta name="twitter:creator" content="@bidscents">
  
  <!-- Telegram specific -->
  <meta name="telegram:channel" content="@bidscents">
  
  <!-- Pinterest specific -->
  <meta property="pinterest:price" content="${price.toFixed(2)}">
  <meta property="pinterest:currency" content="MYR">
  
  <!-- LinkedIn specific -->
  <meta property="article:author" content="${sellerName}">
  
  <!-- Structured Data -->
  <script type="application/ld+json">
    ${JSON.stringify(structuredData)}
  </script>
  
  <!-- Automatic redirect to the actual page after a delay to allow crawlers to parse -->
  <meta http-equiv="refresh" content="3;url=${pageUrl}">
  
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      text-align: center;
      line-height: 1.6;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 20px 0;
    }
    h1 {
      color: #7c3aed;
    }
    p {
      color: #4b5563;
    }
    .price {
      font-size: 24px;
      font-weight: bold;
      color: #10b981;
      margin: 10px 0;
    }
    .condition {
      color: #6b7280;
      font-size: 14px;
    }
    .seller {
      color: #6b7280;
      font-size: 14px;
    }
    .cta {
      display: inline-block;
      background-color: #7c3aed;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      text-decoration: none;
      margin-top: 20px;
      font-weight: bold;
    }
    .cta:hover {
      background-color: #6b21a8;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <img src="${imageUrl}" alt="${title}">
  <p class="price">RM ${price.toFixed(2)}</p>
  <p class="condition">${remainingPercentage}% Full${volume ? ` - ${volume}` : ''} | ${isNew ? 'Like New' : 'Used'}</p>
  <p class="seller">Sold by ${sellerName}</p>
  <p>${description}</p>
  <a href="${pageUrl}" class="cta">View Product</a>
  <p>Redirecting to BidScents...</p>
</body>
</html>`;
}