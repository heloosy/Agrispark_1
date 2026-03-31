# Smart Farming Assistant - Setup & Test Guide

Your project is built and ready in: `C:\Users\SYLVIA TOM\.gemini\antigravity\scratch\farming-assistant`

## 1. Configure the `.env` file
Open the `.env` file in the project directory and fill in your keys:
*   `TWILIO_ACCOUNT_SID`
*   `TWILIO_AUTH_TOKEN`
*   `TWILIO_PHONE_NUMBER` (your Twilio voice number, e.g., +1234567890)
*   `GEMINI_API_KEY` (your Google Gemini API Key)
*   Leave `TWILIO_WHATSAPP_NUMBER` as is, unless you have an approved custom WhatsApp sender.

## 2. Start the Local Server
Open a terminal in the `farming-assistant` folder and run:
\`\`\`bash
npm run dev
\`\`\`
It should say "Farming Assistant Server is listening on port 3000".

## 3. Expose the Server with ngrok
In a **new** terminal window, run ngrok to create a public URL for your local port 3000:
\`\`\`bash
ngrok http 3000
\`\`\`
Copy the **Forwarding URL** that looks like `https://xxxx.ngrok-free.app`.

## 4. Configure Twilio Webhooks
1. Go to your Twilio Console > Phone Numbers > Manage > Active Numbers.
2. Click your Twilio phone number.
3. Scroll down to **Voice & Fax**.
   * Where it says "A Call Comes In", paste your ngrok URL with `/voice` at the end:
     `https://xxxx.ngrok-free.app/voice`
   * Ensure the method is **HTTP POST**.
4. Click **Save**.

## 5. Test It!
*   **Call** your Twilio phone number from your real phone.
*   **Option 1 (Quick mode):** Press 1 and ask a short question (e.g., "My tomato leaves are turning yellow"). It will give a short AI response.
*   **Option 2 (Full mode):** Press 2. It will ask for your Name, Location, Crop, and Stage one by one. After the questions, check your WhatsApp for the completed farming plan!

*(Note: For WhatsApp, if using the Twilio Sandbox, you must first send a message like "join strict-zebra" to the sandbox number to opt-in from your phone before it can send you messages!)*
