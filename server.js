require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const ai = require('./services/ai');
const path = require('path');
const { getSession, updateSession } = require('./services/state');

const app = express();
app.use(express.urlencoded({ extended: true })); // Twilio sends Form Data
app.use(express.json()); // For handling frontend Javascript JSON fetch requests

// Serve static frontend GUI (public/index.html)
app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.PORT || 3000;

// Twilio Client for WhatsApp
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ------------- //
// FRONTEND API  //
// ------------- //

// Helper to clean up speech-to-text artifacts like trailing dots/commas
function sanitizeInput(text) {
  if (!text) return '';
  return text.trim().replace(/[.,!?;:]+$/, '');
}

// Allows the Web Frontend to easily place a call directly
app.post('/api/call', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) return res.status(400).json({ error: 'Phone number is required' });

  try {
    // Vercel runs behind a proxy, so we force HTTPS unless testing locally
    const isLocal = req.get('host').includes('localhost');
    const protocol = isLocal ? 'http' : 'https';
    
    const hostUrl = protocol + '://' + req.get('host');
    const voiceUrl = `${hostUrl}/voice`;

    console.log(`[Frontend] Triggering Call to ${phoneNumber} using Webhook: ${voiceUrl}`);

    const call = await twilioClient.calls.create({
       url: voiceUrl,
       to: phoneNumber,
       from: process.env.TWILIO_PHONE_NUMBER
    });

    res.json({ success: true, callSid: call.sid });
  } catch (error) {
    console.error("[Frontend] API Call Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ------------- //
// VOICE ROUTING //
// ------------- //

// STEP 1: GREETING
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: '/voice/handle-selection',
    method: 'POST',
    timeout: 5
  });

  gather.say(
    "Welcome to Smart Farming Assistant. " +
    "For a quick question, press 1. " +
    "For complete farming guidance, press 2."
  );

  // If no input, it repeats once
  twiml.redirect('/voice');
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// STEP 2: INPUT HANDLING
app.post('/voice/handle-selection', async (req, res) => {
  const digits = req.body.Digits;
  const callerId = req.body.Direction === 'outbound-api' ? req.body.To : req.body.From;
  const twiml = new twilio.twiml.VoiceResponse();
  
  const session = await getSession(callerId);

  if (digits === '1') {
    // QUICK QUERY MODE
    await updateSession(callerId, { mode: 'quick' });
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/quick-query',
      timeout: 3,
      speechTimeout: 'auto'
    });
    gather.say("Please tell your question.");
    twiml.redirect('/voice/handle-selection?Digits=1'); // Retry loop for silence
  } else if (digits === '2') {
    // START AI-DRIVEN CONVERSATION (AUTONOMOUS)
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/full-assistance',
      timeout: 5,
      speechTimeout: 'auto'
    });
    gather.say("Great. I am your expert farming assistant. How can I help you today?");
    // SILENCE PROTECTION: Loop to full-assistance
    twiml.redirect('/voice/full-assistance');
  } else {
    // Invalid input or default
    twiml.say("Invalid choice.");
    twiml.redirect('/voice');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// QUICK QUERY MODE HANDLER
app.post('/voice/quick-query', async (req, res) => {
  const userQuery = req.body.SpeechResult || '';
  const twiml = new twilio.twiml.VoiceResponse();

  if (!userQuery) {
    twiml.say("I didn't hear anything. Do you want detailed guidance? Press 2.");
  } else {
    const aiResponse = await ai.getQuickResponse(userQuery);
    
    // We add another gather in case they want to press 2 after the quick response
    const gather = twiml.gather({
      numDigits: 1,
      action: '/voice/handle-selection',
      timeout: 3
    });
    gather.say(aiResponse); // The prompt AI response already asks "Press 2"
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// FULL ASSISTANCE MODE HANDLER (AUTONOMOUS AI)
app.post('/voice/full-assistance', async (req, res) => {
  const callerId = req.body.Direction === 'outbound-api' ? req.body.To : req.body.From;
  const userInput = req.body.SpeechResult || 'Hello';
  const twiml = new twilio.twiml.VoiceResponse();
  
  const session = await getSession(callerId);
  const cleanInput = sanitizeInput(userInput);

  // Generate the autonomous PhD response
  const aiResponse = await ai.getDynamicVoiceResponse(cleanInput, session.voiceHistory);
  
  // Persist the segment for context
  session.voiceHistory.push({ role: 'user', parts: [{ text: cleanInput }] });
  session.voiceHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
  
  // Prune history for IVR speed (Keep last 3 turns)
  if (session.voiceHistory.length > 6) session.voiceHistory.splice(0, 2);
  await updateSession(callerId, session);

  // Check if Gemini is finalizing the dialogue
  if (aiResponse.toLowerCase().includes("whatsapp") || aiResponse.toLowerCase().includes("manual")) {
    twiml.say(aiResponse);
    twiml.hangup();
    
    // Async background task for WhatsApp delivery
    (async () => {
        const formData = await ai.extractFarmerData(session.voiceHistory);
        await generateAndSendWhatsApp(callerId, formData);
        await updateSession(callerId, { voiceHistory: [] });
    })();
  } else {
    // Keep the conversation alive with a gather and a fallback redirect
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/full-assistance',
      timeout: 4,
      speechTimeout: 'auto'
    });
    gather.say(aiResponse);
    
    // IF THE USER IS SILENT during the gather, this redirect will loop back to /voice/full-assistance
    // We send a default empty result to trigger the 'I am listening' response from AI.
    // SILENCE PROTECTION: Loop back to full-assistance if no speech detected
    twiml.redirect('/voice/full-assistance');
  }

  // --- SAVE CONVERSATION HISTORY ---
  session.voiceHistory.push({ role: 'user', parts: [{ text: cleanInput }] });
  session.voiceHistory.push({ role: 'model', parts: [{ text: aiResponse }] });

  // Ensure and await session save before response
  await updateSession(callerId, { voiceHistory: session.voiceHistory });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Renders the beautiful print-ready plan template
app.get('/view-plan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'plan_template.html'));
});

// Fetches the deep-dive AI content for the web view
app.get('/api/detailed-manual', async (req, res) => {
  const { name, location, crop, pastCrop, soilType, terrain, stage } = req.query;
  const detailedPlan = await ai.generateDetailedPlan({ name, location, crop, pastCrop, soilType, terrain, stage });
  res.json({ plan: detailedPlan });
});

// ------------- //
// WHATSAPP BOT  //
// ------------- //

app.post('/whatsapp', async (req, res) => {
  const incomingMsg = req.body.Body || '';
  const senderNumber = req.body.From; 
  const mediaUrl = req.body.MediaUrl0; // Twilio image URL
  
  const twiml = new twilio.twiml.MessagingResponse();
  const session = await getSession(senderNumber);

  if (incomingMsg.trim() || mediaUrl) {
      console.log(`\n[💬 WhatsApp in from ${senderNumber}]: ${incomingMsg} ${mediaUrl ? `(Media: ${mediaUrl})` : ''}`);
      
      // Get AI response with history and optional image
      const aiReply = await ai.getWhatsAppChatResponse(incomingMsg, session.whatsappHistory, mediaUrl);
      
      // Update history (keep last 5 interactions / 10 messages)
      session.whatsappHistory.push({ role: 'user', parts: [{ text: incomingMsg + (mediaUrl ? ` [Image: ${mediaUrl}]` : '') }] });
      session.whatsappHistory.push({ role: 'model', parts: [{ text: aiReply }] });
      if (session.whatsappHistory.length > 10) session.whatsappHistory.splice(0, 2);

      // Persist the history to Vercel KV
      await updateSession(senderNumber, { whatsappHistory: session.whatsappHistory });

      twiml.message(aiReply);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// WHATSAPP HELPER
async function generateAndSendWhatsApp(toPhone, formData) {
  try {
    const summaryPlan = await ai.generateFullPlan(formData);
    
    // Create the public link for the detailed PDF version
    const isLocal = !process.env.VERCEL;
    const host = isLocal ? 'localhost:3000' : 'agrispark-lilac.vercel.app';
    const protocol = isLocal ? 'http' : 'https';
    
    // Pass ALL 6 points to the detailed manual view
    const detailedLink = `${protocol}://${host}/view-plan?name=${encodeURIComponent(formData.name)}&location=${encodeURIComponent(formData.location)}&crop=${encodeURIComponent(formData.crop)}&pastCrop=${encodeURIComponent(formData.pastCrop)}&soilType=${encodeURIComponent(formData.soilType)}&terrain=${encodeURIComponent(formData.terrain)}&stage=${encodeURIComponent(formData.stage)}`;

    const fullMessage = `${summaryPlan}\n\n📖 *GET YOUR ADVANCED 6-POINT PDF MANUAL:* \n${detailedLink}`;

    // Twilio WhatsApp formatting
    let toWhatsApp = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;

    await twilioClient.messages.create({
      body: fullMessage,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: toWhatsApp
    });

    console.log(`Plan successfully sent to ${toWhatsApp}`);
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
  }
}

// Only listen locally if not deployed on Vercel
if (!process.env.VERCEL) {
  app.listen(port, () => {
      console.log(`Farming Assistant Server is listening on port ${port}`);
  });
}

// Export the app for Vercel serverless deployment
module.exports = app;
