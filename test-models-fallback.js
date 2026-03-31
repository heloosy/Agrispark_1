require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: 'Hi'
        });
        console.log("Success:", result.text);
    } catch (e) {
        console.log("Failed with gemini-2.0-flash:", e.message);
        try {
            const result = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: 'Hi'
            });
            console.log("Success with gemini-1.5-flash:", result.text);
        } catch (e2) {
            console.log("Failed with gemini-1.5-flash:", e2.message);
        }
    }
}

test();
