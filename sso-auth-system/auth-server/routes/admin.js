import express from 'express';
import adminController from '../controllers/adminController.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';

const router = express.Router();

const ADMIN_CLIENT_ID = 'admin-panel';
const ADMIN_CLIENT_SECRET = 'admin-secret-change-in-production';
const ADMIN_CALLBACK_URL = 'http://localhost:3303/admin/callback';

const checkAdminAuth = async (req, res, next) => {
  if (req.session && req.session.admin_access_token) {
    req.headers.authorization = `Bearer ${req.session.admin_access_token}`;
    return next();
  }
  
  const authUrl = `/oauth2/authorize?response_type=code&client_id=${ADMIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(ADMIN_CALLBACK_URL)}&scope=openid%20profile%20email%20admin&state=${encodeURIComponent(req.originalUrl)}`;
  
  res.redirect(authUrl);
};

router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      console.error('OAuth error:', error);
      return res.redirect('/admin/login-error?error=' + encodeURIComponent(error));
    }
    
    if (!code) {
      return res.redirect('/admin/login-error?error=missing_code');
    }
    
    const tokenResponse = await fetch('http://localhost:3303/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: ADMIN_CLIENT_ID,
        client_secret: ADMIN_CLIENT_SECRET,
        redirect_uri: ADMIN_CALLBACK_URL
      })
    });
    
    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenResponse.status);
      return res.redirect('/admin/login-error?error=token_exchange_failed');
    }
    
    const tokenData = await tokenResponse.json();
    
    req.session.admin_access_token = tokenData.access_token;
    req.session.admin_user = tokenData;
    
    const redirectUrl = state && state !== 'undefined' ? state : '/admin/dashboard';
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Admin callback error:', error);
    res.redirect('/admin/login-error?error=callback_processing_failed');
  }
});

router.get('/login-error', (req, res) => {
  const error = req.query.error || 'unknown_error';
  res.render('admin/login-error', {
    error: error,
    pageTitle: 'Login Error'
  });
});

const handleLogout = (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      res.redirect('/admin');
    });
  } else {
    res.redirect('/admin');
  }
};

router.get('/logout', handleLogout);
router.post('/logout', handleLogout);

router.get('/', (req, res) => {
  res.redirect('/admin/dashboard');
});

router.use(checkAdminAuth);
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/dashboard', adminController.showDashboard);
router.get('/users', adminController.showUsers);
router.get('/clients', adminController.showClients);
router.get('/origins', adminController.showOrigins);
router.get('/system', adminController.showSystemInfo);

export default router;