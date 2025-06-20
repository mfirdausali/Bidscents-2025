-- Comprehensive Authentication Verification Fix
-- This script creates database triggers and functions to automatically handle
-- user profile creation during the email verification process

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

-- Function to handle new user creation in auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    username_base TEXT;
    final_username TEXT;
    counter INTEGER := 0;
    auth_provider TEXT;
BEGIN
    -- Log the trigger execution
    RAISE LOG 'Creating user profile for new auth user: %', NEW.email;
    
    -- Determine the authentication provider
    auth_provider := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
    
    -- Generate base username from email
    username_base := split_part(NEW.email, '@', 1);
    -- Clean username: remove special characters and make lowercase
    username_base := lower(regexp_replace(username_base, '[^a-zA-Z0-9]', '', 'g'));
    
    -- Ensure username uniqueness
    final_username := username_base;
    WHILE EXISTS(SELECT 1 FROM public.users WHERE username = final_username) LOOP
        counter := counter + 1;
        final_username := username_base || counter::TEXT;
        -- Prevent infinite loops
        IF counter > 9999 THEN
            final_username := username_base || extract(epoch from now())::INTEGER::TEXT;
            EXIT;
        END IF;
    END LOOP;
    
    -- Create user profile in public.users
    INSERT INTO public.users (
        email,
        username,
        first_name,
        last_name,
        provider_id,
        provider,
        is_verified,
        profile_image,
        created_at,
        updated_at
    ) VALUES (
        NEW.email,
        final_username,
        COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'firstName'),
        COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'lastName'),
        NEW.id,
        auth_provider,
        CASE WHEN NEW.email_confirmed_at IS NOT NULL THEN true ELSE false END,
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
        NOW(),
        NOW()
    );
    
    RAISE LOG 'Successfully created user profile for: % with username: %', NEW.email, final_username;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the auth.users insert
        RAISE LOG 'Error creating public.users record for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle email confirmation and other updates
CREATE OR REPLACE FUNCTION handle_user_email_confirmed()
RETURNS TRIGGER AS $$
BEGIN
    -- Update verification status when email is confirmed
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
        UPDATE public.users 
        SET 
            is_verified = true,
            updated_at = NOW()
        WHERE provider_id = NEW.id;
        
        RAISE LOG 'Updated verification status for user: %', NEW.email;
    END IF;
    
    -- Handle email changes
    IF OLD.email != NEW.email THEN
        UPDATE public.users 
        SET 
            email = NEW.email,
            updated_at = NOW()
        WHERE provider_id = NEW.id;
        
        RAISE LOG 'Updated email for user from % to %', OLD.email, NEW.email;
    END IF;
    
    -- Handle user metadata changes (name, avatar)
    IF OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data THEN
        UPDATE public.users 
        SET 
            first_name = COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'firstName'),
            last_name = COALESCE(NEW.raw_user_meta_data->>'last_name', NEW.raw_user_meta_data->>'lastName'),
            profile_image = COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
            updated_at = NOW()
        WHERE provider_id = NEW.id;
        
        RAISE LOG 'Updated user metadata for user: %', NEW.email;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error but don't fail the auth.users update
        RAISE LOG 'Error updating public.users record for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER on_auth_user_updated
    AFTER UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_user_email_confirmed();

-- Function to repair existing orphaned users
CREATE OR REPLACE FUNCTION repair_orphaned_users()
RETURNS TABLE(
    email TEXT,
    username TEXT,
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    auth_user RECORD;
    username_base TEXT;
    final_username TEXT;
    counter INTEGER;
    auth_provider TEXT;
BEGIN
    -- Find users in auth.users that don't exist in public.users
    FOR auth_user IN 
        SELECT au.id, au.email, au.raw_user_meta_data, au.raw_app_meta_data, au.email_confirmed_at
        FROM auth.users au
        LEFT JOIN public.users pu ON au.id = pu.provider_id
        WHERE pu.id IS NULL AND au.email IS NOT NULL
    LOOP
        BEGIN
            -- Determine the authentication provider
            auth_provider := COALESCE(auth_user.raw_app_meta_data->>'provider', 'email');
            
            -- Generate base username from email
            username_base := split_part(auth_user.email, '@', 1);
            username_base := lower(regexp_replace(username_base, '[^a-zA-Z0-9]', '', 'g'));
            
            -- Ensure username uniqueness
            final_username := username_base;
            counter := 0;
            WHILE EXISTS(SELECT 1 FROM public.users WHERE username = final_username) LOOP
                counter := counter + 1;
                final_username := username_base || counter::TEXT;
                IF counter > 9999 THEN
                    final_username := username_base || extract(epoch from now())::INTEGER::TEXT;
                    EXIT;
                END IF;
            END LOOP;
            
            -- Create the missing user profile
            INSERT INTO public.users (
                email,
                username,
                first_name,
                last_name,
                provider_id,
                provider,
                is_verified,
                profile_image,
                created_at,
                updated_at
            ) VALUES (
                auth_user.email,
                final_username,
                COALESCE(auth_user.raw_user_meta_data->>'first_name', auth_user.raw_user_meta_data->>'firstName'),
                COALESCE(auth_user.raw_user_meta_data->>'last_name', auth_user.raw_user_meta_data->>'lastName'),
                auth_user.id,
                auth_provider,
                CASE WHEN auth_user.email_confirmed_at IS NOT NULL THEN true ELSE false END,
                COALESCE(auth_user.raw_user_meta_data->>'avatar_url', auth_user.raw_user_meta_data->>'picture'),
                NOW(),
                NOW()
            );
            
            -- Return success
            email := auth_user.email;
            username := final_username;
            success := true;
            error_message := NULL;
            RETURN NEXT;
            
        EXCEPTION
            WHEN OTHERS THEN
                -- Return error
                email := auth_user.email;
                username := NULL;
                success := false;
                error_message := SQLERRM;
                RETURN NEXT;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to count orphaned users
CREATE OR REPLACE FUNCTION count_orphaned_users()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM auth.users au
        LEFT JOIN public.users pu ON au.id = pu.provider_id
        WHERE pu.id IS NULL AND au.email IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION repair_orphaned_users() TO authenticated;
GRANT EXECUTE ON FUNCTION count_orphaned_users() TO authenticated;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Authentication verification fix completed successfully';
    RAISE NOTICE 'Triggers created: on_auth_user_created, on_auth_user_updated';
    RAISE NOTICE 'Functions created: handle_new_user, handle_user_email_confirmed, repair_orphaned_users, count_orphaned_users';
END $$;