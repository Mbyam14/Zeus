-- Migration: 002_instacart_integration.sql
-- Description: Add tables for Instacart integration
-- Run this in Supabase SQL Editor

-- Table: instacart_carts
-- Tracks carts created from Zeus grocery lists
CREATE TABLE IF NOT EXISTS instacart_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grocery_list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,

    -- Instacart-specific fields
    instacart_cart_id VARCHAR(255),
    instacart_checkout_url TEXT,
    retailer_id VARCHAR(100),
    retailer_name VARCHAR(200),

    -- Status tracking
    status VARCHAR(50) DEFAULT 'draft',  -- draft, created, redirected, ordered, completed, failed

    -- Order tracking (from webhook)
    order_id VARCHAR(255),
    order_status VARCHAR(50),
    order_total DECIMAL(10, 2),
    estimated_delivery_time TIMESTAMP,

    -- Product matching stats
    total_items_sent INT DEFAULT 0,
    items_matched INT DEFAULT 0,
    items_not_found INT DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Table: instacart_product_cache
-- Cache product search results to reduce API calls (24hr TTL)
CREATE TABLE IF NOT EXISTS instacart_product_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Search key (normalized ingredient name + retailer)
    normalized_name VARCHAR(200) NOT NULL,
    retailer_id VARCHAR(100) NOT NULL,

    -- Product data from Instacart
    instacart_product_id VARCHAR(255),
    product_name VARCHAR(500),
    product_image_url TEXT,
    unit_price DECIMAL(10, 2),
    unit_size VARCHAR(100),
    availability VARCHAR(50) DEFAULT 'available',

    -- Metadata
    search_score FLOAT,
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cache_expires_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(normalized_name, retailer_id)
);

-- Table: instacart_cart_items
-- Track individual items in an Instacart cart
CREATE TABLE IF NOT EXISTS instacart_cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instacart_cart_id UUID NOT NULL REFERENCES instacart_carts(id) ON DELETE CASCADE,
    grocery_list_item_id UUID REFERENCES grocery_list_items(id) ON DELETE SET NULL,

    -- Original item data
    original_item_name VARCHAR(200),
    original_quantity FLOAT,
    original_unit VARCHAR(50),

    -- Matched product data
    instacart_product_id VARCHAR(255),
    matched_product_name VARCHAR(500),
    matched_unit_price DECIMAL(10, 2),
    quantity_to_buy INT DEFAULT 1,
    line_total DECIMAL(10, 2),

    -- Match status
    match_status VARCHAR(50) DEFAULT 'pending',  -- pending, matched, not_found, low_confidence, manual
    match_confidence FLOAT,

    -- User overrides
    user_selected_product_id VARCHAR(255),
    user_adjusted_quantity INT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: user_instacart_preferences
-- Store user's Instacart preferences
CREATE TABLE IF NOT EXISTS user_instacart_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Preferred retailers
    preferred_retailers JSONB DEFAULT '[]',
    default_retailer_id VARCHAR(100),

    -- Location
    zip_code VARCHAR(10),

    -- Preferences
    auto_select_products BOOLEAN DEFAULT true,
    prefer_organic BOOLEAN DEFAULT false,
    prefer_store_brand BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_instacart_carts_user_id ON instacart_carts(user_id);
CREATE INDEX IF NOT EXISTS idx_instacart_carts_grocery_list_id ON instacart_carts(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_instacart_carts_status ON instacart_carts(status);
CREATE INDEX IF NOT EXISTS idx_instacart_product_cache_search ON instacart_product_cache(normalized_name, retailer_id);
CREATE INDEX IF NOT EXISTS idx_instacart_product_cache_expires ON instacart_product_cache(cache_expires_at);
CREATE INDEX IF NOT EXISTS idx_instacart_cart_items_cart ON instacart_cart_items(instacart_cart_id);

-- Enable Row Level Security
ALTER TABLE instacart_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instacart_cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_instacart_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies for instacart_carts
CREATE POLICY "Users can view their own carts" ON instacart_carts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own carts" ON instacart_carts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own carts" ON instacart_carts
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for user_instacart_preferences
CREATE POLICY "Users can view their own preferences" ON user_instacart_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON user_instacart_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_instacart_preferences
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypass for backend operations
CREATE POLICY "Service role has full access to carts" ON instacart_carts
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to cart items" ON instacart_cart_items
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to preferences" ON user_instacart_preferences
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to cache" ON instacart_product_cache
    FOR ALL USING (auth.role() = 'service_role');
