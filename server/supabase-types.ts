export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: number
          username: string
          password: string
          email: string
          first_name: string | null
          last_name: string | null
          address: string | null
          profile_image: string | null
          wallet_balance: number
          is_seller: boolean
          is_admin: boolean
          is_banned: boolean
        }
        Insert: {
          id?: number
          username: string
          password: string
          email: string
          first_name?: string | null
          last_name?: string | null
          address?: string | null
          profile_image?: string | null
          wallet_balance?: number
          is_seller?: boolean
          is_admin?: boolean
          is_banned?: boolean
        }
        Update: {
          id?: number
          username?: string
          password?: string
          email?: string
          first_name?: string | null
          last_name?: string | null
          address?: string | null
          profile_image?: string | null
          wallet_balance?: number
          is_seller?: boolean
          is_admin?: boolean
          is_banned?: boolean
        }
      }
      categories: {
        Row: {
          id: number
          name: string
          description: string | null
        }
        Insert: {
          id?: number
          name: string
          description?: string | null
        }
        Update: {
          id?: number
          name?: string
          description?: string | null
        }
      }
      products: {
        Row: {
          id: number
          name: string
          brand: string
          description: string | null
          price: number
          image_url: string
          stock_quantity: number
          category_id: number | null
          seller_id: number
          is_new: boolean
          is_featured: boolean
          created_at: string
          remaining_percentage: number | null
          batch_code: string | null
          purchase_year: number | null
          box_condition: string | null
          listing_type: string | null
          volume: number
        }
        Insert: {
          id?: number
          name: string
          brand: string
          description?: string | null
          price: number
          image_url: string
          stock_quantity?: number
          category_id?: number | null
          seller_id: number
          is_new?: boolean
          is_featured?: boolean
          created_at?: string
          remaining_percentage?: number | null
          batch_code?: string | null
          purchase_year?: number | null
          box_condition?: string | null
          listing_type?: string | null
          volume?: number
        }
        Update: {
          id?: number
          name?: string
          brand?: string
          description?: string | null
          price?: number
          image_url?: string
          stock_quantity?: number
          category_id?: number | null
          seller_id?: number
          is_new?: boolean
          is_featured?: boolean
          created_at?: string
          remaining_percentage?: number | null
          batch_code?: string | null
          purchase_year?: number | null
          box_condition?: string | null
          listing_type?: string | null
          volume?: number | null
        }
      }
      product_images: {
        Row: {
          id: number
          product_id: number
          image_url: string
          image_order: number
          image_name: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          product_id: number
          image_url: string
          image_order?: number
          image_name?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          product_id?: number
          image_url?: string
          image_order?: number
          image_name?: string | null
          created_at?: string | null
        }
      }
      reviews: {
        Row: {
          id: number
          user_id: number
          product_id: number
          rating: number
          comment: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          user_id: number
          product_id: number
          rating: number
          comment?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          user_id?: number
          product_id?: number
          rating?: number
          comment?: string | null
          created_at?: string | null
        }
      }
      orders: {
        Row: {
          id: number
          user_id: number
          total: number
          status: string
          created_at: string | null
        }
        Insert: {
          id?: number
          user_id: number
          total: number
          status?: string
          created_at?: string | null
        }
        Update: {
          id?: number
          user_id?: number
          total?: number
          status?: string
          created_at?: string | null
        }
      }
      order_items: {
        Row: {
          id: number
          order_id: number
          product_id: number
          quantity: number
          price: number
        }
        Insert: {
          id?: number
          order_id: number
          product_id: number
          quantity: number
          price: number
        }
        Update: {
          id?: number
          order_id?: number
          product_id?: number
          quantity?: number
          price?: number
        }
      }
      auctions: {
        Row: {
          id: number
          product_id: number
          starting_price: number
          reserve_price: number | null
          buy_now_price: number | null
          current_bid: number | null
          current_bidder_id: number | null
          bid_increment: number
          starts_at: string
          ends_at: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          product_id: number
          starting_price: number
          reserve_price?: number | null
          buy_now_price?: number | null
          current_bid?: number | null
          current_bidder_id?: number | null
          bid_increment?: number
          starts_at?: string
          ends_at: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          product_id?: number
          starting_price?: number
          reserve_price?: number | null
          buy_now_price?: number | null
          current_bid?: number | null
          current_bidder_id?: number | null
          bid_increment?: number
          starts_at?: string
          ends_at?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      bids: {
        Row: {
          id: number
          auction_id: number
          bidder_id: number
          amount: number
          placed_at: string
          is_winning: boolean
        }
        Insert: {
          id?: number
          auction_id: number
          bidder_id: number
          amount: number
          placed_at?: string
          is_winning?: boolean
        }
        Update: {
          id?: number
          auction_id?: number
          bidder_id?: number
          amount?: number
          placed_at?: string
          is_winning?: boolean
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}