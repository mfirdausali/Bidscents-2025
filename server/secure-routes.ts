/**
 * Secure API Routes with Unified Authentication
 * 
 * This module implements secure API endpoints using the consolidated authentication system.
 * All routes use consistent security middleware and proper error handling.
 */

import express from 'express';
import { secureAuthRoutes, verifySupabaseAuth, requireAuth, requireRole } from './auth-security';
import { storage } from './storage';

const router = express.Router();

// Security middleware applied to all routes
router.use((req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // CSRF protection for state-changing operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin');
    const referer = req.get('referer');
    const allowedOrigins = [
      process.env.APP_URL || 'http://localhost:5000',
      'https://' + process.env.REPLIT_DOMAINS?.split(',')[0],
    ].filter(Boolean);
    
    if (origin && !allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return res.status(403).json({ error: 'Invalid origin' });
    }
  }
  
  next();
});

// Auth endpoints using Supabase verification
router.post('/auth/session', secureAuthRoutes.session);
router.get('/auth/me', requireAuth, secureAuthRoutes.me);
router.post('/auth/logout', requireAuth, secureAuthRoutes.logout);
router.post('/auth/lookup-email', secureAuthRoutes.lookupEmail);

// User profile endpoints
router.get('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await storage.getUserByProviderId(userId.toString());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Return public user information only
    res.json({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      isSeller: user.isSeller,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user profile (authenticated users only)
router.patch('/users/me', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { firstName, lastName, username } = req.body;

    // Validate input
    if (username && username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    // Check if username is already taken (if changing)
    if (username && username !== user.username) {
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const updatedUser = await storage.updateUser(user.id, {
      firstName: firstName || user.firstName,
      lastName: lastName || user.lastName,
      username: username || user.username,
    });

    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      isSeller: updatedUser.isSeller,
      isAdmin: updatedUser.isAdmin,
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Seller-specific endpoints
router.post('/seller/register', requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    
    // Check if user is already a seller
    if (user.isSeller) {
      return res.status(400).json({ error: 'User is already a seller' });
    }

    const updatedUser = await storage.updateUser(user.id, {
      isSeller: true,
    });

    res.json({
      message: 'Successfully registered as seller',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        isSeller: updatedUser.isSeller,
        isAdmin: updatedUser.isAdmin,
      },
    });
  } catch (error) {
    console.error('Error registering seller:', error);
    res.status(500).json({ error: 'Failed to register as seller' });
  }
});

// Admin-only endpoints
router.get('/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    // Get users with pagination
    const users = await storage.getUsers(limit, offset);
    
    res.json({
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSeller: user.isSeller,
        isAdmin: user.isAdmin,
        isBanned: user.isBanned,
        createdAt: user.createdAt,
      })),
      pagination: {
        page,
        limit,
        hasMore: users.length === limit,
      },
    });
  } catch (error) {
    console.error('Error fetching users for admin:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/admin/users/:id/ban', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { banned } = req.body;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const updatedUser = await storage.updateUser(userId, {
      isBanned: Boolean(banned),
    });

    res.json({
      message: `User ${banned ? 'banned' : 'unbanned'} successfully`,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        isBanned: updatedUser.isBanned,
      },
    });
  } catch (error) {
    console.error('Error updating user ban status:', error);
    res.status(500).json({ error: 'Failed to update ban status' });
  }
});

// Health check endpoint (no auth required)
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

export { router as secureRoutes };