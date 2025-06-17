/**
 * Execute Authentication Verification Fix
 * This script runs the SQL commands to create database triggers and functions
 * that automatically handle user profile creation during email verification
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeAuthFix() {
  console.log('🔧 Starting authentication verification fix...');

  try {
    // Step 1: Drop existing triggers
    console.log('🔄 Dropping existing triggers...');
    const { error: dropError } = await supabase.rpc('execute_sql', {
      query: `
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
      `
    });

    // Step 2: Create handle_new_user function
    console.log('🔄 Creating handle_new_user function...');
    const { error: functionError1 } = await supabase.rpc('execute_sql', {
      query: `
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
      `
    });

    if (functionError1) {
      console.error('❌ Error creating handle_new_user function:', functionError1);
      throw functionError1;
    }

    // Step 3: Create handle_user_email_confirmed function
    console.log('🔄 Creating handle_user_email_confirmed function...');
    const { error: functionError2 } = await supabase.rpc('execute_sql', {
      query: `
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
      `
    });

    if (functionError2) {
      console.error('❌ Error creating handle_user_email_confirmed function:', functionError2);
      throw functionError2;
    }

    // Step 4: Create triggers
    console.log('🔄 Creating database triggers...');
    const { error: triggerError } = await supabase.rpc('execute_sql', {
      query: `
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION handle_new_user();

        CREATE TRIGGER on_auth_user_updated
            AFTER UPDATE ON auth.users
            FOR EACH ROW EXECUTE FUNCTION handle_user_email_confirmed();
      `
    });

    if (triggerError) {
      console.error('❌ Error creating triggers:', triggerError);
      throw triggerError;
    }

    console.log('✅ Authentication verification fix completed successfully!');
    console.log('✅ Database triggers and functions created');
    console.log('✅ Future user registrations will automatically create profiles');

    // Step 5: Check for existing orphaned users
    console.log('🔄 Checking for existing orphaned users...');
    const { data: orphanCount, error: countError } = await supabase.rpc('count_orphaned_users');
    
    if (countError) {
      console.log('⚠️ Could not check orphaned users count:', countError.message);
    } else {
      console.log(`📊 Found ${orphanCount || 0} orphaned users that need profile creation`);
      
      if (orphanCount > 0) {
        console.log('🔄 Attempting to repair orphaned users...');
        const { data: repairResults, error: repairError } = await supabase.rpc('repair_orphaned_users');
        
        if (repairError) {
          console.log('⚠️ Could not repair orphaned users:', repairError.message);
        } else {
          const successful = repairResults.filter(r => r.success).length;
          const failed = repairResults.filter(r => !r.success).length;
          
          console.log(`✅ Successfully repaired ${successful} orphaned user profiles`);
          if (failed > 0) {
            console.log(`⚠️ Failed to repair ${failed} orphaned user profiles`);
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Authentication fix failed:', error);
    process.exit(1);
  }
}

// Run the fix
executeAuthFix().then(() => {
  console.log('🎉 Authentication verification fix deployment complete!');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Failed to deploy authentication fix:', error);
  process.exit(1);
});