// Simple in-memory session store
// Keys are phone numbers (e.g. "+1234567890")
// Values: { mode: 'full', step: 'name', data: { name: '', location: '', crop: '', stage: '' } }

const sessions = {};

function getSession(phoneNumber) {
  if (!sessions[phoneNumber]) {
    sessions[phoneNumber] = {
      mode: null,
      step: null,
      data: {},
      whatsappHistory: []
    };
  }
  return sessions[phoneNumber];
}

function updateSession(phoneNumber, updates) {
  const session = getSession(phoneNumber);
  Object.assign(session, updates);
}

function clearSession(phoneNumber) {
  delete sessions[phoneNumber];
}

// Map of the question order for Full Assistance mode
const FULL_ASSIST_STEPS = ['name', 'location', 'crop', 'stage'];

module.exports = {
  getSession,
  updateSession,
  clearSession,
  FULL_ASSIST_STEPS
};
