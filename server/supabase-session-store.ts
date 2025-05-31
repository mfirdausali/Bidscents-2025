import { Store } from 'express-session';
import { supabase } from './supabase';

interface SessionData {
  sid: string;
  sess: any;
  expire: Date;
}

/**
 * Custom Supabase Session Store for Express Session
 * This completely isolates sessions in Supabase to prevent session hijacking
 */
export class SupabaseSessionStore extends Store {
  constructor() {
    super();
    this.initializeSessionTable();
  }

  /**
   * Initialize the sessions table in Supabase if it doesn't exist
   */
  private async initializeSessionTable() {
    try {
      // Create sessions table if it doesn't exist
      const { error } = await supabase.rpc('create_sessions_table_if_not_exists');
      
      if (error && !error.message.includes('already exists')) {
        // If RPC doesn't exist, create table directly
        const createTableQuery = `
          CREATE TABLE IF NOT EXISTS sessions (
            sid TEXT PRIMARY KEY,
            sess JSONB NOT NULL,
            expire TIMESTAMP WITH TIME ZONE NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);
        `;
        
        await supabase.rpc('exec_sql', { sql: createTableQuery });
      }
      
      console.log('🔐 Supabase session store initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Supabase session store:', error);
    }
  }

  /**
   * Get session data from Supabase
   */
  get(sid: string, callback: (err?: any, session?: any) => void) {
    const sessionId = Math.random().toString(36).substr(2, 9);
    console.log(`🔐 [${sessionId}] SESSION GET - SID: ${sid}`);
    
    supabase
      .from('sessions')
      .select('sess, expire')
      .eq('sid', sid)
      .single()
      .then(({ data, error }) => {
        try {
          if (error) {
            if (error.code === 'PGRST116') {
              // No session found
              console.log(`🔐 [${sessionId}] SESSION NOT FOUND - SID: ${sid}`);
              return callback(null, null);
            }
            console.error(`🔐 [${sessionId}] SESSION GET ERROR:`, error);
            return callback(error);
          }

          // Check if session has expired
          if (data.expire && new Date(data.expire) <= new Date()) {
            console.log(`🔐 [${sessionId}] SESSION EXPIRED - SID: ${sid}`);
            this.destroy(sid, () => {});
            return callback(null, null);
          }

          console.log(`🔐 [${sessionId}] SESSION FOUND - SID: ${sid}, User: ${data.sess?.passport?.user || 'none'}`);
          callback(null, data.sess);
        } catch (innerError) {
          console.error(`🔐 [${sessionId}] SESSION GET INNER ERROR:`, innerError);
          callback(innerError);
        }
      })
      .catch((promiseError) => {
        console.error(`🔐 [${sessionId}] SESSION GET PROMISE ERROR:`, promiseError);
        callback(promiseError);
      });
  }

  /**
   * Set session data in Supabase
   */
  set(sid: string, session: any, callback?: (err?: any) => void) {
    const sessionId = Math.random().toString(36).substr(2, 9);
    const userId = session?.passport?.user || 'none';
    console.log(`🔐 [${sessionId}] SESSION SET - SID: ${sid}, User: ${userId}`);
    
    const expire = session.cookie?.expires 
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + (24 * 60 * 60 * 1000)); // 24 hours default

    supabase
      .from('sessions')
      .upsert({
        sid,
        sess: session,
        expire: expire.toISOString()
      })
      .then(({ error }) => {
        if (error) {
          console.error(`🔐 [${sessionId}] SESSION SET ERROR:`, error);
          return callback?.(error);
        }
        
        console.log(`🔐 [${sessionId}] SESSION SAVED - SID: ${sid}, User: ${userId}, Expires: ${expire.toISOString()}`);
        callback?.();
      });
  }

  /**
   * Destroy session in Supabase
   */
  destroy(sid: string, callback?: (err?: any) => void) {
    const sessionId = Math.random().toString(36).substr(2, 9);
    console.log(`🔐 [${sessionId}] SESSION DESTROY - SID: ${sid}`);
    
    supabase
      .from('sessions')
      .delete()
      .eq('sid', sid)
      .then(({ error }) => {
        if (error) {
          console.error(`🔐 [${sessionId}] SESSION DESTROY ERROR:`, error);
          return callback?.(error);
        }
        
        console.log(`🔐 [${sessionId}] SESSION DESTROYED - SID: ${sid}`);
        callback?.();
      });
  }

  /**
   * Clean up expired sessions
   */
  touch(sid: string, session: any, callback?: (err?: any) => void) {
    const expire = session.cookie?.expires 
      ? new Date(session.cookie.expires)
      : new Date(Date.now() + (24 * 60 * 60 * 1000));

    supabase
      .from('sessions')
      .update({ expire: expire.toISOString() })
      .eq('sid', sid)
      .then(({ error }) => {
        if (error) {
          console.error('SESSION TOUCH ERROR:', error);
          return callback?.(error);
        }
        callback?.();
      });
  }

  /**
   * Clean up expired sessions (called periodically)
   */
  private async cleanupExpiredSessions() {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('sessions')
        .delete()
        .lt('expire', now);
        
      if (error) {
        console.error('Session cleanup error:', error);
      } else {
        console.log('🧹 Cleaned up expired sessions');
      }
    } catch (error) {
      console.error('Session cleanup error:', error);
    }
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  startCleanup() {
    // Clean up expired sessions every hour
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
    
    console.log('🔐 Supabase session cleanup scheduled (every hour)');
  }
}