-- SQL script to create the messages table in Supabase

-- Create the messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES public.users(id),
  receiver_id INTEGER NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL, -- Will store encrypted message content
  product_id INTEGER REFERENCES public.products(id),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_product_id ON public.messages(product_id);

-- Set up Row Level Security (RLS) policies
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to see messages they've sent or received
CREATE POLICY "Users can view their own messages"
  ON public.messages FOR SELECT
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Create a policy that allows users to send messages (insert)
CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (sender_id = auth.uid());

-- Create a policy that allows users to update only messages they've received (for marking as read)
CREATE POLICY "Users can update messages they received"
  ON public.messages FOR UPDATE
  USING (receiver_id = auth.uid());

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.messages_id_seq TO authenticated;