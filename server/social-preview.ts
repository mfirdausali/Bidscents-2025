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
const DEFAULT_IMAGE_URL = "https://bidscents.replit.app/logo-social.svg";
const BASE_URL = "https://bidscents.replit.app";

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
  
  <!-- Automatic redirect to the actual page after a short delay -->
  <meta http-equiv="refresh" content="0;url=${pageUrl}">
  
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