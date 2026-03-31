const { createClient } = require('@vercel/kv');

// Initialize Vercel KV client
// The user used the prefix 'STORAGE' in their Vercel dashboard.
const kv = createClient({
  url: process.env.STORAGE_REST_API_URL,
  token: process.env.STORAGE_REST_API_TOKEN,
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
