const { createClient } = require('redis');

// Initialize Redis client using the REDIS_URL from your Vercel screenshot
const client = createClient({
  url: process.env.REDIS_URL || process.env.STORAGE_URL, 
  socket: {
    reconnectStrategy: retries => Math.min(retries * 50, 500) // Fast reconnect for serverless
  }
});

client.on('error', err => console.error('Redis Client Error', err));

/**
 * Ensures the Redis client is connected before any operation.
 */
async function ensureConnection() {
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (err) {
      console.error("[Redis] Reconnect failed:", err.message);
    }
  }
}

/**
 * Gets a session from Redis with robust reconnection logic.
 */
async function getSession(phoneNumber) {
  try {
    await ensureConnection();
    
    let sessionData = await client.get(`session:${phoneNumber}`);
    let session = sessionData ? JSON.parse(sessionData) : null;
    
    if (!session) {
      // DEFAULT STRUCTURE TO PREVENT AMNESIA
      session = {
        mode: null,
        step: null,
        data: { name: null, location: null, targetCrop: null }, 
        whatsappHistory: [],
        voiceHistory: []
      };
    }
    
    return session;
  } catch (error) {
    console.error(`[Redis Error] Amnesia Prevention Active for ${phoneNumber}:`, error.message);
    // FALLBACK: Always return a valid session structure to prevent crashes
    return {
      mode: null,
      step: null,
      data: {},
      whatsappHistory: [],
      voiceHistory: []
    };
  }
}

/**
 * Updates a session in Redis.
 */
async function updateSession(phoneNumber, updates) {
  try {
    await ensureConnection();
    
    const session = await getSession(phoneNumber);
    const updatedSession = Object.assign(session, updates);
    await client.set(`session:${phoneNumber}`, JSON.stringify(updatedSession));
    return updatedSession;
  } catch (error) {
    console.error(`[Redis] Update Error for ${phoneNumber}:`, error.message);
  }
}

/**
 * Clears a session in Redis.
 */
async function clearSession(phoneNumber) {
  try {
    await ensureConnection();
    await client.del(`session:${phoneNumber}`);
  } catch (error) {
    console.error(`[Redis] Clear Error for ${phoneNumber}:`, error.message);
  }
}

const FULL_ASSIST_STEPS = ['name', 'location', 'crop', 'stage'];

module.exports = {
  getSession,
  updateSession,
  clearSession,
  FULL_ASSIST_STEPS
};
