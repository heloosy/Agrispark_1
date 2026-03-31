require('dotenv').config();
const twilio = require('twilio');

// Load API Keys
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

async function makeTestCall() {
  try {
    // ⚠️ REPLACE THIS WITH YOUR ACTUAL INDIAN CELL PHONE NUMBER (Include +91)
    const yourIndianNumber = "+917736215631";

    // ⚠️ REPLACE THIS WITH YOUR VERIFIED NGROK URL (Include /voice)
    const yourNgrokUrl = "https://real-oranges-throw.loca.lt/voice";

    console.log(`Ringing ${yourIndianNumber}... Please pick up when your cell phone rings!`);

    const call = await client.calls.create({
      url: yourNgrokUrl,
      to: yourIndianNumber,
      from: process.env.TWILIO_PHONE_NUMBER
    });

    console.log(`Call successfully dispatched! Call SID: ${call.sid}`);

  } catch (error) {
    console.error("Failed to make test call:", error.message);
  }
}

makeTestCall();
