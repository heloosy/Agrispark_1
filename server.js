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
app.post('/voice/handle-selection', (req, res) => {
  const digits = req.body.Digits;
  // If outbound call, the user is the 'To' number. If inbound, user is 'From'.
  const callerId = req.body.Direction === 'outbound-api' ? req.body.To : req.body.From;
  const twiml = new twilio.twiml.VoiceResponse();
  
  const session = getSession(callerId);

  if (digits === '1') {
    // QUICK QUERY MODE
    session.mode = 'quick';
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/quick-query',
      timeout: 3,
      speechTimeout: 'auto'
    });
    gather.say("Please tell your question.");
    twiml.say("We didn't catch that. Goodbye!");
  } else if (digits === '2') {
    twiml.say("Great. Let's get started. What is your name?");
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/full-assistance?step=name',
      timeout: 4
    });
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

// FULL ASSISTANCE MODE HANDLER
app.post('/voice/full-assistance', async (req, res) => {
  // If outbound call, the user is the 'To' number. If inbound, user is 'From'.
  const callerId = req.body.Direction === 'outbound-api' ? req.body.To : req.body.From;
  const userInput = req.body.SpeechResult || 'Unknown';
  const twiml = new twilio.twiml.VoiceResponse();
  
  const cleanInput = sanitizeInput(userInput);

  if (step === 'name') {
    twiml.say("Where is your farm located?");
    twiml.gather({
      input: 'speech',
      action: `/voice/full-assistance?step=location&name=${encodeURIComponent(cleanInput)}`,
      timeout: 4
    });
  } else if (step === 'location') {
    twiml.say("What crop are you currently growing?");
    twiml.gather({
      input: 'speech',
      action: `/voice/full-assistance?step=crop&name=${encodeURIComponent(name)}&location=${encodeURIComponent(cleanInput)}`,
      timeout: 4
    });
  } else if (step === 'crop') {
    twiml.say("What stage is your crop at? For example, sowing, growing, or harvest.");
    twiml.gather({
      input: 'speech',
      action: `/voice/full-assistance?step=stage&name=${encodeURIComponent(name)}&location=${encodeURIComponent(location)}&crop=${encodeURIComponent(cleanInput)}`,
      timeout: 5
    });
  } else if (step === 'stage') {
    // All questions answered
    twiml.say("I’ve created your personalized farming plan. It will be sent to your WhatsApp shortly. Thank you for calling!");
    twiml.hangup();

    // Vercel immediately freezes background tasks when res.send() fires.
    // So we MUST strictly 'await' the WhatsApp sending before ending the webhook block!
    console.log(`[Vercel Sync] Waiting for WhatsApp to successfully send to ${callerId}...`);
    
    // Package all the gathered data together
    const formData = {
      name: name,
      location: location,
      crop: crop,
      stage: cleanInput // The last speech result
    };
    
    await generateAndSendWhatsApp(callerId, formData);
  } else {
    // Session expired fallback
    twiml.say("Session expired. Please call again.");
    twiml.hangup();
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Renders the beautiful print-ready plan template
app.get('/view-plan', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'plan_template.html'));
});

// Fetches the deep-dive AI content for the web view
app.get('/api/detailed-manual', async (req, res) => {
  const { name, location, crop, stage } = req.query;
  const detailedPlan = await ai.generateDetailedPlan({ name, location, crop, stage });
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
  const session = getSession(senderNumber);

  if (incomingMsg.trim() || mediaUrl) {
      console.log(`\n[💬 WhatsApp in from ${senderNumber}]: ${incomingMsg} ${mediaUrl ? `(Media: ${mediaUrl})` : ''}`);
      
      // Get AI response with history and optional image
      const aiReply = await ai.getWhatsAppChatResponse(incomingMsg, session.whatsappHistory, mediaUrl);
      
      // Update history (keep last 5 interactions / 10 messages)
      session.whatsappHistory.push({ role: 'user', parts: [{ text: incomingMsg + (mediaUrl ? ` [Image: ${mediaUrl}]` : '') }] });
      session.whatsappHistory.push({ role: 'model', parts: [{ text: aiReply }] });
      if (session.whatsappHistory.length > 10) session.whatsappHistory.splice(0, 2);

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
    const detailedLink = `${protocol}://${host}/view-plan?name=${encodeURIComponent(formData.name)}&location=${encodeURIComponent(formData.location)}&crop=${encodeURIComponent(formData.crop)}&stage=${encodeURIComponent(formData.stage)}`;

    const fullMessage = `${summaryPlan}\n\n📖 GET FULL 30-DAY PDF MANUAL:\n${detailedLink}`;

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
