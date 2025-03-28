import { db } from "../server/db";
import { users, products, categories } from "../shared/schema";
import pkg from "pg";
const { Pool } = pkg;
import { eq } from "drizzle-orm";
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

  // Check if we already have sellers
  const existingSellers = await db.select().from(users).where(eq(users.isSeller, true));
  if (existingSellers.length > 0) {
    console.log("Database already has sellers. Skipping seeding to avoid duplicates.");
    process.exit(0);
  }

  // 1. Create seller accounts
  const sellerAccounts = [
    {
      username: "chanel_official",
      password: await hashPassword("Chanel123!"),
      email: "chanel_seller@example.com",
      firstName: "Chanel",
      lastName: "Official",
      address: "Paris, France",
      isSeller: true
    },
    {
      username: "ysl_boutique",
      password: await hashPassword("YSL123!"),
      email: "ysl_seller@example.com",
      firstName: "Yves Saint",
      lastName: "Laurent",
      address: "Paris, France",
      isSeller: true
    },
    {
      username: "dior_fragrance",
      password: await hashPassword("Dior123!"),
      email: "dior_seller@example.com",
      firstName: "Christian",
      lastName: "Dior",
      address: "Paris, France",
      isSeller: true
    },
    {
      username: "tom_ford_beauty",
      password: await hashPassword("TomFord123!"),
      email: "tomford_seller@example.com",
      firstName: "Tom",
      lastName: "Ford",
      address: "New York, USA",
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
  
  // 3. Create product entries
  const sampleProducts = [
    // Chanel products (seller 0)
    {
      name: "Chanel No. 5",
      brand: "Chanel",
      description: "Iconic and timeless, Chanel No. 5 features notes of rose, jasmine, and vanilla for a sophisticated feminine fragrance.",
      price: 135.00,
      imageUrl: "https://images.unsplash.com/photo-1592312406345-70c822a73402?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y2hhbmVsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 25,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[0],
      isNew: false,
      isFeatured: true
    },
    {
      name: "Coco Mademoiselle",
      brand: "Chanel",
      description: "A fresh, oriental fragrance with notes of orange, jasmine, and patchouli for a vibrant, feminine appeal.",
      price: 112.00,
      imageUrl: "https://images.unsplash.com/photo-1592931067630-66be6dda3a8f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8Y2hhbmVsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 30,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[0],
      isNew: false,
      isFeatured: false
    },
    {
      name: "Bleu de Chanel",
      brand: "Chanel",
      description: "A woody aromatic fragrance for men with notes of citrus, ginger, and sandalwood for a fresh, masculine scent.",
      price: 120.00,
      imageUrl: "https://images.unsplash.com/photo-1585386959984-a4a9a13f176c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MXx8Ymx1ZSUyMGNoYW5lbHxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 35,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[0],
      isNew: false,
      isFeatured: true
    },
    {
      name: "Chanel Chance",
      brand: "Chanel",
      description: "A floral fragrance with pink pepper, jasmine, and amber, creating a playful, youthful scent.",
      price: 108.00,
      imageUrl: "https://images.unsplash.com/photo-1585386975744-273e928e851b?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Nnx8Y2hhbmVsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 20,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[0],
      isNew: false,
      isFeatured: false
    },
    {
      name: "Gabrielle Chanel",
      brand: "Chanel",
      description: "A radiant floral with notes of jasmine, ylang-ylang, orange blossom, and tuberose for a luminous feminine scent.",
      price: 140.00,
      imageUrl: "https://images.unsplash.com/photo-1585386959967-e9b6be3da4b3?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTB8fGNoYW5lbCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 15,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[0],
      isNew: true,
      isFeatured: true
    },

    // YSL products (seller 1)
    {
      name: "Black Opium",
      brand: "Yves Saint Laurent",
      description: "A sensual, addictive fragrance with notes of coffee, vanilla, and white flowers for an energetic, modern feminine scent.",
      price: 128.00,
      imageUrl: "https://images.unsplash.com/photo-1590736969297-dd6e9e34d0d2?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8eXNsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 18,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[1],
      isNew: false,
      isFeatured: true
    },
    {
      name: "YSL Libre",
      brand: "Yves Saint Laurent",
      description: "A bold floral with notes of lavender, orange blossom, and vanilla for a modern, feminine expression of freedom.",
      price: 115.00,
      imageUrl: "https://images.unsplash.com/photo-1590763650067-1a343d7fab0d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NHx8eXNsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 22,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[1],
      isNew: true,
      isFeatured: false
    },
    {
      name: "YSL Y",
      brand: "Yves Saint Laurent",
      description: "A fresh, woody fragrance with bergamot, ginger, and sage for a confident, masculine scent.",
      price: 110.00,
      imageUrl: "https://images.unsplash.com/photo-1585386964463-4a718cc9db0c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8eXNsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 25,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[1],
      isNew: false,
      isFeatured: true
    },
    {
      name: "Mon Paris",
      brand: "Yves Saint Laurent",
      description: "A fruity, floral chypre with strawberry, raspberry, patchouli, and white musk for a modern, passionate scent.",
      price: 105.00,
      imageUrl: "https://images.unsplash.com/photo-1592842313054-3de4294b5693?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NXx8eXNsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 20,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[1],
      isNew: false,
      isFeatured: false
    },
    {
      name: "L'Homme",
      brand: "Yves Saint Laurent",
      description: "An elegant blend of ginger, basil, and vetiver for a refined, sophisticated masculine scent.",
      price: 95.00,
      imageUrl: "https://images.unsplash.com/photo-1588777527713-f456134c3629?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8N3x8eXNsJTIwcGVyZnVtZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 27,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[1],
      isNew: false,
      isFeatured: false
    },

    // Dior products (seller 2)
    {
      name: "J'adore",
      brand: "Dior",
      description: "A floral bouquet with notes of rose, jasmine, and ylang-ylang for a luxurious, elegant feminine fragrance.",
      price: 138.00,
      imageUrl: "https://images.unsplash.com/photo-1585451121917-9ee1371fcb95?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 28,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[2],
      isNew: false,
      isFeatured: true
    },
    {
      name: "Sauvage",
      brand: "Dior",
      description: "A raw, fresh fragrance with notes of bergamot, pepper, and amberwood for a strong, masculine scent.",
      price: 115.00,
      imageUrl: "https://images.unsplash.com/photo-1588869826255-e672fb1efc8f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8OHx8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 32,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[2],
      isNew: false,
      isFeatured: true
    },
    {
      name: "Miss Dior",
      brand: "Dior",
      description: "A chypre floral with notes of rose, bergamot, and patchouli for a modern, romantic feminine fragrance.",
      price: 120.00,
      imageUrl: "https://images.unsplash.com/photo-1598662779094-110c2bad80b5?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 24,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[2],
      isNew: true,
      isFeatured: false
    },
    {
      name: "Dior Homme",
      brand: "Dior",
      description: "A sophisticated blend of iris, lavender, and cocoa for an elegant, refined masculine scent.",
      price: 105.00,
      imageUrl: "https://images.unsplash.com/photo-1591375372156-542495912da9?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8OXx8ZGlvciUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 18,
      categoryId: categoryMap.get("Men's Fragrances"),
      sellerId: sellerIds[2],
      isNew: false,
      isFeatured: false
    },
    {
      name: "Hypnotic Poison",
      brand: "Dior",
      description: "A bewitching oriental vanilla with notes of bitter almond, caraway, and sambac jasmine for a mysterious feminine scent.",
      price: 110.00,
      imageUrl: "https://images.unsplash.com/photo-1608528577891-eb055943c1fc?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTB8fGRpb3IlMjBwZXJmdW1lfGVufDB8fDB8fA%3D%3D&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 16,
      categoryId: categoryMap.get("Women's Fragrances"),
      sellerId: sellerIds[2],
      isNew: false,
      isFeatured: false
    },

    // Tom Ford products (seller 3)
    {
      name: "Tom Ford Tobacco Vanille",
      brand: "Tom Ford",
      description: "A warm, spicy blend of tobacco leaf, vanilla, and ginger for a rich, opulent unisex fragrance.",
      price: 350.00,
      imageUrl: "https://images.unsplash.com/photo-1578996834254-13d1b661a5ed?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MXx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 12,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[3],
      isNew: false,
      isFeatured: true
    },
    {
      name: "Tom Ford Oud Wood",
      brand: "Tom Ford",
      description: "An exotic blend of rare oud wood, sandalwood, and Chinese pepper for a luxurious, distinctive unisex fragrance.",
      price: 375.00,
      imageUrl: "https://images.unsplash.com/photo-1592842312564-82e84a8e0c94?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 10,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[3],
      isNew: false,
      isFeatured: true
    },
    {
      name: "Tom Ford Black Orchid",
      brand: "Tom Ford",
      description: "A luxurious blend of black truffle, ylang-ylang, and black orchid for a rich, sensual unisex fragrance.",
      price: 280.00,
      imageUrl: "https://images.unsplash.com/photo-1602928383393-c7d01e6fe558?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8M3x8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 15,
      categoryId: categoryMap.get("Unisex"),
      sellerId: sellerIds[3],
      isNew: false,
      isFeatured: false
    },
    {
      name: "Tom Ford Lost Cherry",
      brand: "Tom Ford",
      description: "A sweet blend of black cherry, bitter almond, and rose for a lavish, indulgent unisex fragrance.",
      price: 390.00,
      imageUrl: "https://images.unsplash.com/photo-1594035910387-fea47794261f?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NHx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 8,
      categoryId: categoryMap.get("Niche"),
      sellerId: sellerIds[3],
      isNew: true,
      isFeatured: true
    },
    {
      name: "Tom Ford Neroli Portofino",
      brand: "Tom Ford",
      description: "A fresh citrus blend of Sicilian lemon, bergamot, and neroli for a vibrant, refreshing unisex fragrance.",
      price: 310.00,
      imageUrl: "https://images.unsplash.com/photo-1610461888570-7fbf5c7e7911?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NXx8dG9tJTIwZm9yZCUyMHBlcmZ1bWV8ZW58MHx8MHx8&auto=format&fit=crop&w=800&q=60",
      stockQuantity: 14,
      categoryId: categoryMap.get("Unisex"),
      sellerId: sellerIds[3],
      isNew: false,
      isFeatured: false
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