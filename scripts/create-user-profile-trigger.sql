-- Database Trigger to Automatically Create public.users Records
-- This ensures every auth.users record has a corresponding public.users record

-- Function to handle new user creation in public.users table
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    username_base TEXT;
    username_candidate TEXT;
    username_counter INTEGER := 0;
    username_exists BOOLEAN;
BEGIN
    -- Generate a base username from email
    username_base := COALESCE(
        NEW.raw_user_meta_data->>'username',
        SPLIT_PART(NEW.email, '@', 1)
    );
    
    -- Clean the username (remove special characters, convert to lowercase)
    username_base := LOWER(REGEXP_REPLACE(username_base, '[^a-zA-Z0-9_]', '', 'g'));
    
    -- Ensure username is not empty
    IF username_base = '' OR username_base IS NULL THEN
        username_base := 'user';
    END IF;
    
    -- Find a unique username
    username_candidate := username_base;
    
    LOOP
        -- Check if username exists
        SELECT EXISTS(
            SELECT 1 FROM public.users WHERE username = username_candidate
        ) INTO username_exists;
        
        EXIT WHEN NOT username_exists;
        
        -- If username exists, try with a number suffix
        username_counter := username_counter + 1;
        username_candidate := username_base || username_counter;
        
        -- Prevent infinite loops
        IF username_counter > 9999 THEN
            username_candidate := username_base || EXTRACT(EPOCH FROM NOW())::TEXT;
            EXIT;
        END IF;
    END LOOP;
    
    -- Insert new user into public.users table
    INSERT INTO public.users (
        email,
        username,
        first_name,
        last_name,
        wallet_balance,
        is_seller,
        is_admin,
        is_banned,
        is_verified,
        provider_id,
        provider
    ) VALUES (
        NEW.email,
        username_candidate,
        COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'firstName'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'lastName'),
        0, -- Default wallet balance
        true, -- Default to seller account
        false, -- Default not admin
        false, -- Default not banned
        false, -- Default not verified (will be updated on email confirmation)
        NEW.id, -- Supabase auth user ID
        'supabase' -- Auth provider
    );
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the auth.users creation
        RAISE LOG 'Error creating public.users record for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to handle email confirmation updates
CREATE OR REPLACE FUNCTION handle_user_email_confirmed()
RETURNS TRIGGER AS $$
BEGIN
    -- Update is_verified status when email is confirmed
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
        UPDATE public.users 
        SET is_verified = true 
        WHERE provider_id = NEW.id;
    END IF;
    
    -- Handle email changes
    IF OLD.email != NEW.email THEN
        UPDATE public.users 
        SET email = NEW.email 
        WHERE provider_id = NEW.id;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the update
        RAISE LOG 'Error updating public.users record for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for email confirmation updates
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_user_email_confirmed();

-- Function to find and repair orphaned auth users (missing public.users records)
CREATE OR REPLACE FUNCTION repair_orphaned_users()
RETURNS TABLE(
    auth_user_id UUID,
    email TEXT,
    created_username TEXT,
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    orphaned_user RECORD;
    username_base TEXT;
    username_candidate TEXT;
    username_counter INTEGER;
    username_exists BOOLEAN;
    result_record RECORD;
BEGIN
    -- Find auth.users without corresponding public.users records
    FOR orphaned_user IN 
        SELECT au.id, au.email, au.raw_user_meta_data, au.email_confirmed_at
        FROM auth.users au
        LEFT JOIN public.users pu ON pu.provider_id = au.id::TEXT
        WHERE pu.id IS NULL
    LOOP
        BEGIN
            -- Generate username
            username_base := COALESCE(
                orphaned_user.raw_user_meta_data->>'username',
                SPLIT_PART(orphaned_user.email, '@', 1)
            );
            username_base := LOWER(REGEXP_REPLACE(username_base, '[^a-zA-Z0-9_]', '', 'g'));
            
            IF username_base = '' OR username_base IS NULL THEN
                username_base := 'user';
            END IF;
            
            -- Find unique username
            username_candidate := username_base;
            username_counter := 0;
            
            LOOP
                SELECT EXISTS(
                    SELECT 1 FROM public.users WHERE username = username_candidate
                ) INTO username_exists;
                
                EXIT WHEN NOT username_exists;
                
                username_counter := username_counter + 1;
                username_candidate := username_base || username_counter;
                
                IF username_counter > 9999 THEN
                    username_candidate := username_base || EXTRACT(EPOCH FROM NOW())::TEXT;
                    EXIT;
                END IF;
            END LOOP;
            
            -- Create the missing public.users record
            INSERT INTO public.users (
                email,
                username,
                first_name,
                last_name,
                wallet_balance,
                is_seller,
                is_admin,
                is_banned,
                is_verified,
                provider_id,
                provider
            ) VALUES (
                orphaned_user.email,
                username_candidate,
                COALESCE(orphaned_user.raw_user_meta_data->>'first_name', orphaned_user.raw_user_meta_data->>'firstName'),
                COALESCE(orphaned_user.raw_user_meta_data->>'last_name', orphaned_user.raw_user_meta_data->>'lastName'),
                0,
                true,
                false,
                false,
                CASE WHEN orphaned_user.email_confirmed_at IS NOT NULL THEN true ELSE false END,
                orphaned_user.id::TEXT,
                'supabase'
            );
            
            -- Return success
            auth_user_id := orphaned_user.id;
            email := orphaned_user.email;
            created_username := username_candidate;
            success := true;
            error_message := NULL;
            RETURN NEXT;
            
        EXCEPTION
            WHEN OTHERS THEN
                -- Return error
                auth_user_id := orphaned_user.id;
                email := orphaned_user.email;
                created_username := NULL;
                success := false;
                error_message := SQLERRM;
                RETURN NEXT;
        END;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for orphaned users (for monitoring)
CREATE OR REPLACE FUNCTION count_orphaned_users()
RETURNS INTEGER AS $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO orphan_count
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.provider_id = au.id::TEXT
    WHERE pu.id IS NULL;
    
    RETURN orphan_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON public.users(provider_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION repair_orphaned_users() TO service_role;
GRANT EXECUTE ON FUNCTION count_orphaned_users() TO service_role;