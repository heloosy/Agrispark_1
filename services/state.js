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
 * Gets a session from Redis.
 * Vercel is stateless, so we must use a persistent database for memory.
 */
async function getSession(phoneNumber) {
  try {
    // Wait for the Redis connection to be established
    await connectionPromise;
    
    let sessionData = await client.get(`session:${phoneNumber}`);
    let session = sessionData ? JSON.parse(sessionData) : null;
    
    if (!session) {
      session = {
        mode: null,
        step: null,
        data: {},
        whatsappHistory: [],
        voiceHistory: []
      };
      // Save the initial session
      await client.set(`session:${phoneNumber}`, JSON.stringify(session));
    }
    
    return session;
  } catch (error) {
    console.error(`[Redis] Error getting session for ${phoneNumber}:`, error.message);
    // FALLBACK: Always return a valid session object with history arrays to prevent crashes or amnesia
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
    // Wait for the Redis connection to be established
    await connectionPromise;
    
    const session = await getSession(phoneNumber);
    const updatedSession = Object.assign(session, updates);
    await client.set(`session:${phoneNumber}`, JSON.stringify(updatedSession));
    return updatedSession;
  } catch (error) {
    console.error(`[Redis] Error updating session for ${phoneNumber}:`, error.message);
  }
}

async function clearSession(phoneNumber) {
  try {
    // Wait for the Redis connection to be established
    await connectionPromise;
    await client.del(`session:${phoneNumber}`);
  } catch (error) {
    console.error(`[Redis] Error clearing session for ${phoneNumber}:`, error.message);
  }
}

const FULL_ASSIST_STEPS = ['name', 'location', 'crop', 'stage'];

module.exports = {
  getSession,
  updateSession,
  clearSession,
  FULL_ASSIST_STEPS
};
