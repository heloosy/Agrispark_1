const { createClient } = require('redis');

// Initialize Redis client using the REDIS_URL from your Vercel screenshot
const client = createClient({
  url: process.env.REDIS_URL || process.env.STORAGE_URL // Support both common names
});

client.on('error', err => console.error('Redis Client Error', err));

// Connect to Redis (this is required for the 'redis' package v4+)
const connectionPromise = client.connect().catch(err => {
    console.error("Initial Redis connection failed:", err.message);
});

/**
 * Gets a session from Vercel KV (Redis).
 * Vercel is stateless, so we must use a persistent database for memory.
 */
async function getSession(phoneNumber) {
  try {
    let session = await kv.get(`session:${phoneNumber}`);
    
    if (!session) {
      session = {
        mode: null,
        step: null,
        data: {},
        whatsappHistory: []
      };
      // Save the initial session
      await kv.set(`session:${phoneNumber}`, session);
    }
    
    return session;
  } catch (error) {
    console.error(`[KV] Error getting session for ${phoneNumber}:`, error.message);
    // Fallback to in-memory if KV fails (for local testing without KV)
    return {
        mode: null,
        step: null,
        data: {},
        whatsappHistory: []
    };
  }
}

/**
 * Updates a session in Vercel KV.
 */
async function updateSession(phoneNumber, updates) {
  try {
    const session = await getSession(phoneNumber);
    const updatedSession = Object.assign(session, updates);
    await kv.set(`session:${phoneNumber}`, updatedSession);
    return updatedSession;
  } catch (error) {
    console.error(`[KV] Error updating session for ${phoneNumber}:`, error.message);
  }
}

async function clearSession(phoneNumber) {
  try {
    await kv.del(`session:${phoneNumber}`);
  } catch (error) {
    console.error(`[KV] Error clearing session for ${phoneNumber}:`, error.message);
  }
}

const FULL_ASSIST_STEPS = ['name', 'location', 'crop', 'stage'];

module.exports = {
  getSession,
  updateSession,
  clearSession,
  FULL_ASSIST_STEPS
};
