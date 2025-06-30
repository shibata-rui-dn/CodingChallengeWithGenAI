import cors from 'cors';
import { getConfig } from '../../config/configLoader.js';

let allowedOrigins = [];
let clientOrigins = [];
let lastUpdated = 0;
const CACHE_DURATION = 30000;

async function loadAllowedOrigins() {
  try {
    const { default: pool } = await import('../../config/database.js');
    
    const tableExists = pool.rawDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='allowed_origins'"
    ).get();
    
    if (!tableExists) {
      console.log('⚠️ allowed_origins table not found, using config defaults only');
      const config = getConfig();
      allowedOrigins = [
        `http://localhost:3000`,
        config.server.auth_server_url
      ];
      lastUpdated = Date.now();
      return allowedOrigins;
    }
    
    const result = pool.query('SELECT origin FROM allowed_origins WHERE is_active = 1');
    allowedOrigins = result.rows.map(row => row.origin);
    lastUpdated = Date.now();
    
    const config = getConfig();
    const configOrigins = [
      `http://localhost:3000`,
      config.server.auth_server_url
    ];
    
    configOrigins.forEach(origin => {
      if (!allowedOrigins.includes(origin)) {
        allowedOrigins.push(origin);
      }
    });
    
    console.log('✅ Loaded allowed origins:', allowedOrigins);
    return allowedOrigins;
  } catch (error) {
    console.error('Failed to load allowed origins from database:', error);
    const config = getConfig();
    allowedOrigins = [
      `http://localhost:3000`,
      config.server.auth_server_url
    ];
    lastUpdated = Date.now();
    console.log('🔄 Using fallback origins:', allowedOrigins);
    return allowedOrigins;
  }
}

async function loadClientOrigins() {
  try {
    const { default: pool } = await import('../../config/database.js');
    
    const clientsTableExists = pool.rawDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='clients'"
    ).get();
    
    if (!clientsTableExists) {
      console.log('⚠️ clients table not found, no client origins loaded');
      clientOrigins = [];
      return clientOrigins;
    }
    
    const result = pool.query('SELECT client_id, redirect_uris FROM clients WHERE is_active = 1');
    const origins = new Set();
    
    for (const row of result.rows) {
      try {
        const redirectUris = JSON.parse(row.redirect_uris);
        if (Array.isArray(redirectUris)) {
          for (const uri of redirectUris) {
            try {
              const url = new URL(uri);
              const origin = `${url.protocol}//${url.host}`;
              origins.add(origin);
            } catch (urlError) {
              console.warn(`⚠️ Invalid redirect URI for client ${row.client_id}: ${uri}`);
            }
          }
        }
      } catch (parseError) {
        console.warn(`⚠️ Failed to parse redirect_uris for client ${row.client_id}`);
      }
    }
    
    clientOrigins = Array.from(origins);
    console.log('✅ Loaded client origins:', clientOrigins);
    return clientOrigins;
    
  } catch (error) {
    console.error('Failed to load client origins from database:', error);
    clientOrigins = [];
    return clientOrigins;
  }
}

async function getAllowedOrigins() {
  const now = Date.now();
  if (now - lastUpdated > CACHE_DURATION || allowedOrigins.length === 0) {
    await loadAllowedOrigins();
    await loadClientOrigins();
  }
  return allowedOrigins;
}

async function getCSPOrigins() {
  const now = Date.now();
  if (now - lastUpdated > CACHE_DURATION || allowedOrigins.length === 0 || clientOrigins.length === 0) {
    await loadAllowedOrigins();
    await loadClientOrigins();
  }
  
  const cspOrigins = new Set([...allowedOrigins, ...clientOrigins]);
  const finalOrigins = Array.from(cspOrigins);
  
  console.log('🛡️ CSP origins for form-action:', finalOrigins);
  return finalOrigins;
}

async function refreshOrigins() {
  lastUpdated = 0;
  
  await loadAllowedOrigins();
  await loadClientOrigins();
  
  const combinedOrigins = new Set([...allowedOrigins, ...clientOrigins]);
  const finalOrigins = Array.from(combinedOrigins);
  
  console.log('🔄 Origins refreshed:', {
    allowedOrigins: allowedOrigins.length,
    clientOrigins: clientOrigins.length,
    total: finalOrigins.length,
    origins: finalOrigins
  });
  
  return finalOrigins;
}

const dynamicCors = cors({
  origin: async (origin, callback) => {
    try {
      const allowed = await getAllowedOrigins();
      
      if (!origin) {
        return callback(null, true);
      }
      
      if (origin === 'null') {
        return callback(null, true);
      }
      
      const allOrigins = new Set([...allowed, ...clientOrigins]);
      const allowedList = Array.from(allOrigins);
      
      if (allowedList.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`❌ CORS blocked origin: ${origin}`);
        console.log(`   Allowed origins: ${allowedList.join(', ')}`);
        callback(new Error('Not allowed by CORS'));
      }
    } catch (error) {
      console.error('CORS check error:', error);
      callback(error);
    }
  },
  credentials: true
});

export { 
  dynamicCors, 
  getAllowedOrigins, 
  refreshOrigins, 
  loadAllowedOrigins, 
  getCSPOrigins,
  loadClientOrigins
};