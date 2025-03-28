import { db } from "../server/db";
import { users, products, categories } from "../shared/schema";
import pkg from "pg";
const { Pool } = pkg;
import { eq, sql, or, and, gt } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// Function to hash password similar to auth.ts
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  console.log("Starting database seeding...");
  
  // 0. First delete all existing products and non-admin users
  console.log("Cleaning existing database records...");
  
  try {
    // Delete cart items first (foreign key constraint)
    await db.execute(sql`DELETE FROM cart_items`);
    
    // Delete reviews (foreign key constraint)
    await db.execute(sql`DELETE FROM reviews`);
    
    // Delete order items (foreign key constraint)
    await db.execute(sql`DELETE FROM order_items`);
    
    // Delete orders (foreign key constraint)
    await db.execute(sql`DELETE FROM orders`);
    
    // Delete all products
    await db.execute(sql`DELETE FROM products`);
    
    // Delete non-admin users
    await db.execute(sql`DELETE FROM users WHERE is_admin = false`);
    
    console.log("Database cleaned successfully!");
  } catch (error) {
    console.error("Error cleaning database:", error);
    process.exit(1);
  }

  // 1. Create reseller accounts (individual sellers, not brands)
  const sellerAccounts = [
    {
      username: "perfume_collector",
      password: await hashPassword("SecurePass123!"),
      email: "collector@example.com",
      firstName: "Michael",
      lastName: "Anderson",
      address: "San Francisco, CA",
      isSeller: true
    },
    {
      username: "luxury_reseller",
      password: await hashPassword("ResellPwd456!"),
      email: "luxury@example.com",
      firstName: "Sarah",
      lastName: "Johnson",
      address: "New York, NY",
      isSeller: true
    },
    {
      username: "vintage_scents",
      password: await hashPassword("Vintage789!"),
      email: "vintage@example.com",
      firstName: "Robert",
      lastName: "Davies",
      address: "London, UK",
      isSeller: true
    },
    {
      username: "niche_perfumery",
      password: await hashPassword("NicheFrag234!"),
      email: "niche@example.com",
      firstName: "Emma",
      lastName: "Garcia",
      address: "Barcelona, Spain",
      isSeller: true
    },
    {
      username: "scent_enthusiast",
      password: await hashPassword("FragLover567!"),
      email: "enthusiast@example.com",
      firstName: "David",
      lastName: "Kim",
      address: "Seoul, South Korea",
      isSeller: true
    }
  ];

  console.log("Creating seller accounts...");
  const sellerIds = [];
  
  for (const seller of sellerAccounts) {
    const [inserted] = await db.insert(users).values(seller).returning({ id: users.id });
    sellerIds.push(inserted.id);
    console.log(`Created seller: ${seller.username} with ID: ${inserted.id}`);
  }

  // 2. Get all categories
  const allCategories = await db.select().from(categories);
  
  // If no categories exist, create them
  if (allCategories.length === 0) {
    console.log("Creating default categories...");
    
    const defaultCategories = [
      { name: "Women's Fragrances", description: "Perfumes for women" },
      { name: "Men's Fragrances", description: "Perfumes for men" },
      { name: "Unisex", description: "Fragrances for everyone" },
      { name: "Niche", description: "Exclusive and unique fragrances" },
      { name: "New Arrivals", description: "Latest additions to our collection" },
    ];
    
    for (const category of defaultCategories) {
      await db.insert(categories).values(category);
    }
  }
  
  // Fetch fresh categories
  const categoryList = await db.select().from(categories);
  const categoryMap = new Map<string, number>();
  categoryList.forEach(cat => categoryMap.set(cat.name, cat.id));
  
  // 3. Create product entries with secondhand-specific information
  const sampleProducts = [
    // Seller 0 (Michael Anderson) listings
    {
      name: "Chanel No. 5 EDP",
      brand: "Chanel",
      description: "Iconic and timeless fragrance with notes of rose, jasmine, and vanilla. Purchased from Sephora in 2021, used sparingly for special occasions. Comes with original box in excellent condition.",
      price: 85.00, // Discounted from retail
      imageUrl: "https://images.unsplash.com/photo-1592312406345-70c822a73402?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y2hhbmVsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1, // Secondhand items typically have quantity of 1
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[0],
      isNew: false,
      isFeatured: true,
      // Secondhand specific fields
      remainingPercentage: 78,
      batchCode: "3145891209853",
      purchaseYear: 2021,
      boxCondition: "Excellent, with all original packaging",
      listingType: "fixed"
    },
    {
      name: "Bleu de Chanel Parfum",
      brand: "Chanel",
      description: "Woody aromatic fragrance with citrus, ginger, and sandalwood. Blind buy that didn't work for me. Sprayed only a few times. Batch code can be verified online for authenticity.",
      price: 90.00,
      imageUrl: "https://images.unsplash.com/photo-1585386959984-a4a9a13f176c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MXx8Ymx1ZSUyMGNoYW5lbHxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[0],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 95,
      batchCode: "8901",
      purchaseYear: 2022,
      boxCondition: "Mint condition with cellophane",
      listingType: "negotiable"
    },
    {
      name: "Tom Ford Tobacco Vanille (Partial)",
      brand: "Tom Ford",
      description: "Warm, spicy blend with tobacco leaf and vanilla. From my personal collection, decanted from an authentic bottle. Perfect way to sample this expensive fragrance without buying a full bottle.",
      price: 120.00,
      imageUrl: "https://images.unsplash.com/photo-1578996834254-13d1b661a5ed?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MXx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[0],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 45,
      batchCode: "A23",
      purchaseYear: 2020,
      boxCondition: "No box, decant bottle",
      listingType: "auction"
    },

    // Seller 1 (Sarah Johnson) listings
    {
      name: "YSL Black Opium Limited Edition",
      brand: "Yves Saint Laurent",
      description: "Sensual fragrance with notes of coffee and vanilla. Limited holiday edition packaging from 2021. Used for a season then stored properly away from light and heat.",
      price: 75.00,
      imageUrl: "https://images.unsplash.com/photo-1590736969297-dd6e9e34d0d2?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8eXNsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[1],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 68,
      batchCode: "49K01R",
      purchaseYear: 2021,
      boxCondition: "Some wear on edges, collectors packaging",
      listingType: "negotiable"
    },
    {
      name: "Dior Sauvage EDP Tester",
      brand: "Dior",
      description: "Fresh masculine scent with bergamot and pepper. Authentic tester bottle (same juice, simpler packaging). Never used, just opened to verify scent. No cap included as is standard with testers.",
      price: 65.00,
      imageUrl: "https://images.unsplash.com/photo-1588869826255-e672fb1efc8f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8OHx8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[1],
      isNew: true,
      isFeatured: true,
      remainingPercentage: 99,
      batchCode: "3348901430173",
      purchaseYear: 2023,
      boxCondition: "Tester box only, plain white",
      listingType: "fixed"
    },
    {
      name: "Discontinued Guerlain Mitsouko (Vintage)",
      brand: "Guerlain",
      description: "Legendary chypre fragrance, this is from the pre-reformulation era (2005). Stored properly in cool dark place. A rare find for collectors and fragrance enthusiasts.",
      price: 220.00,
      imageUrl: "https://images.unsplash.com/photo-1594035910387-fea47794261f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NHx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[1],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 65,
      batchCode: "5T",
      purchaseYear: 2005,
      boxCondition: "Vintage box with expected aging",
      listingType: "auction"
    },

    // Seller 2 (Robert Davies) listings
    {
      name: "Creed Aventus 2016 Batch",
      brand: "Creed",
      description: "Legendary pineapple-forward batch from 2016, considered one of the best by enthusiasts. Fruity and smoky masculine scent. Stored properly in cool dark cabinet.",
      price: 250.00,
      imageUrl: "https://images.unsplash.com/photo-1592842312564-82e84a8e0c94?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[2],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 35,
      batchCode: "16A01",
      purchaseYear: 2016,
      boxCondition: "Original box with some wear",
      listingType: "auction"
    },
    {
      name: "Jo Malone Wood Sage & Sea Salt",
      brand: "Jo Malone",
      description: "Fresh, mineral fragrance evoking the beach. Purchased last year but doesn't fit my collection direction. Barely used, comes with signature cream and black box.",
      price: 59.00,
      imageUrl: "https://images.unsplash.com/photo-1585451121917-9ee1371fcb95?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Unisex"),
      sellerId: sellerIds[2],
      isNew: false,
      isFeatured: false,
      remainingPercentage: 90,
      batchCode: "22C1",
      purchaseYear: 2022,
      boxCondition: "Like new with gift receipt",
      listingType: "fixed"
    },
    {
      name: "Miss Dior 2017 Formula",
      brand: "Dior",
      description: "The previous formulation before the 2021 update. Many prefer this version with stronger rose and patchouli notes. Perfect feminine chypre fragrance.",
      price: 80.00,
      imageUrl: "https://images.unsplash.com/photo-1598662779094-110c2bad80b5?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[2],
      isNew: false,
      isFeatured: false,
      remainingPercentage: 75,
      batchCode: "7N01",
      purchaseYear: 2017,
      boxCondition: "No box",
      listingType: "negotiable"
    },

    // Seller 3 (Emma Garcia) listings
    {
      name: "Frederic Malle Portrait of a Lady",
      brand: "Frederic Malle",
      description: "Opulent rose and patchouli masterpiece by perfumer Dominique Ropion. Purchased from Barneys before they closed. A stunning fragrance that's unfortunately too powerful for my lifestyle.",
      price: 195.00,
      imageUrl: "https://images.unsplash.com/photo-1602928383393-c7d01e6fe558?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[3],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 85,
      batchCode: "A7BY3",
      purchaseYear: 2019,
      boxCondition: "Original red box in good condition",
      listingType: "fixed"
    },
    {
      name: "Xerjoff 40 Knots (Decant)",
      brand: "Xerjoff",
      description: "10ml decant from my full bottle. Fresh aquatic scent with woody notes. Great summer fragrance from luxury Italian house Xerjoff. Decanted using sterile equipment.",
      price: 38.00,
      imageUrl: "https://images.unsplash.com/photo-1591375372156-542495912da9?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8OXx8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 3,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[3],
      isNew: false,
      isFeatured: false,
      remainingPercentage: 100,
      batchCode: "XJ22",
      purchaseYear: 2022,
      boxCondition: "Decant bottle with professional label",
      listingType: "fixed"
    },
    {
      name: "Tom Ford Lost Cherry (Almost Full)",
      brand: "Tom Ford",
      description: "Sweet cherry and almond masterpiece from Tom Ford's Private Blend line. Used only 3-4 sprays to test. Simply too sweet for my preferences. Authentic, purchased from Nordstrom.",
      price: 250.00,
      imageUrl: "https://images.unsplash.com/photo-1594035910387-fea47794261f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NHx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[3],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 95,
      batchCode: "A93",
      purchaseYear: 2022,
      boxCondition: "Original presentation with outer sleeve",
      listingType: "negotiable"
    },

    // Seller 4 (David Kim) listings
    {
      name: "Vintage Dior Fahrenheit (1995)",
      brand: "Dior",
      description: "The legendary vintage formulation from 1995 with the powerful gasoline note that modern versions lack. A collector's item in good condition considering its age. Unique violet and petroleum masterpiece.",
      price: 175.00,
      imageUrl: "https://images.unsplash.com/photo-1608528577891-eb055943c1fc?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTB8fGRpb3IlMjBwZXJmdW1lfGVufDB8fDB8fA%3D%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[4],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 60,
      batchCode: "5C01",
      purchaseYear: 1995,
      boxCondition: "Vintage box with expected wear",
      listingType: "auction"
    },
    {
      name: "Chanel Coromandel (2016 Formula)",
      brand: "Chanel",
      description: "Sophisticated patchouli fragrance from Chanel's Exclusifs line, from before the 2020 reformulation. The earlier and preferred version according to most enthusiasts. White patchouli with chocolate undertones.",
      price: 150.00,
      imageUrl: "https://images.unsplash.com/photo-1585386975744-273e928e851b?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Nnx8Y2hhbmVsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Unisex"),
      sellerId: sellerIds[4],
      isNew: false,
      isFeatured: false,
      remainingPercentage: 70,
      batchCode: "6501",
      purchaseYear: 2016,
      boxCondition: "No box",
      listingType: "fixed"
    },
    {
      name: "Roja Dove Elysium Parfum Cologne",
      brand: "Roja Parfums",
      description: "Bright, fresh luxury fragrance from master perfumer Roja Dove. Citrus and ambergris create an uplifting yet sophisticated scent. Selling from my personal collection to make room for new acquisitions.",
      price: 210.00,
      imageUrl: "https://images.unsplash.com/photo-1610461888570-7fbf5c7e7911?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NXx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 1,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[4],
      isNew: false,
      isFeatured: true,
      remainingPercentage: 75,
      batchCode: "RPC-8822",
      purchaseYear: 2020,
      boxCondition: "Original packaging with certificate",
      listingType: "negotiable"
    }
  ];

  console.log("Creating sample products...");
  
  for (const product of sampleProducts) {
    await db.insert(products).values(product);
  }

  console.log("Database seeding completed successfully!");
}

main().catch(error => {
  console.error("Error seeding database:", error);
  process.exit(1);
});