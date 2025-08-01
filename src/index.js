// src/index.js
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const player = require('play-sound')(opts = {}); // Sound player

console.log("🐔 Cluck, cluck! Miss Pecky (Node.js) is warming up her Piper Voice!");
console.log("----------------------------------------------------");

// --- Load Personality Configuration ---
let personalityConfig = {};
const defaultPersonality = {
    assistantName: "Anonymous Hen",
    defaultLanguage: "en",
    motto: { en: "Still looking for my notes..." },
    phrases: {
        greetings: { en: ["Hello... I think I lost my notes."] },
        farewells: { en: ["Goodbye... I need to find myself."] },
        misunderstandings: { en: ["My circuits are a bit fuzzy right now."] },
        acknowledgements: { en: ["You got it, cluck!"] },
        jokesAndQuips: { en: ["Why did the chicken cross the playground? To get to the other slide!"] }
    }
};

try {
    const personalityFilePath = path.join(process.cwd(), 'config_node', 'personality.json');
    const rawPersonalityData = fs.readFileSync(personalityFilePath, 'utf8');
    personalityConfig = JSON.parse(rawPersonalityData);
    console.log(`✅ Personality for "${personalityConfig.assistantName}" loaded successfully.`);
} catch (error) {
    console.error("❌ Error loading personality file:", error.message);
    console.log("⚠️ Using default minimal personality.");
    personalityConfig = defaultPersonality;
}
console.log("----------------------------------------------------");

// --- Piper TTS Configuration ---
const piperRootPath = path.join(process.cwd(), 'tts_engine', 'piper');
const piperExecutablePath = path.join(piperRootPath, 'piper');
const piperVoicesBasePath = path.join(piperRootPath, 'voices');

// --- Language Configuration ---
// --- Language Configuration ---
const currentSystemLang = process.env.LANG ? process.env.LANG.substring(0, 2).toLowerCase() : null;
let resolvedLang = personalityConfig.defaultLanguage || 'en';

if (personalityConfig.motto && Object.keys(personalityConfig.motto).length > 0) {
    const supportedLanguages = Object.keys(personalityConfig.motto);
    if (currentSystemLang && supportedLanguages.includes(currentSystemLang)) {
        resolvedLang = currentSystemLang;
    } else if (!supportedLanguages.includes(resolvedLang) && supportedLanguages.includes('en')) {
        resolvedLang = 'en';
    } else if (!supportedLanguages.includes(resolvedLang)) {
        resolvedLang = supportedLanguages[0] || 'en';
    }
} else {
    resolvedLang = defaultPersonality.defaultLanguage || 'en';
}
// const activeLanguage = resolvedLang; // Comentamos la lógica original
const activeLanguage = 'es'; // FORZADO A ESPAÑOL PARA PRUEBA

console.log(`🗣️  Active language for Miss Pecky (Piper TTS): ${activeLanguage.toUpperCase()}`);
console.log("----------------------------------------------------");

// --- Piper TTS Speech Function ---
async function missPeckySpeaksWithPiper(textToSpeak) {
    console.log(`${personalityConfig.assistantName} (Piper Voice) says: "${textToSpeak}"`);

    let modelFileName;
    if (activeLanguage === 'es') {
        modelFileName = 'es_ES-davefx-medium.onnx';
    } else if (activeLanguage === 'gl') {
        modelFileName = 'es_ES-davefx-medium.onnx';
    } else {
        modelFileName = 'en_US-lessac-medium.onnx';
    }

    const modelPath = path.join(piperVoicesBasePath, modelFileName);
    const outputWavFile = path.join(process.cwd(), 'output_piper.wav');

    const piperArgs = [
        '--model', modelPath,
        '--output-file', outputWavFile
    ];

    return new Promise((resolve, reject) => {
        const piperProcess = execFile(piperExecutablePath, piperArgs, (error, stdout, stderr) => {
            if (error) {
                console.error(`Piper TTS error: ${error.message}`);
                reject(error);
                return;
            }

            player.play(outputWavFile, (err) => {
                if (err) {
                    console.error(`Error playing ${outputWavFile}:`, err);
                    reject(err);
                } else {
                    console.log(`Finished playing: ${outputWavFile}`);
                    resolve();
                }
            });
        });

        piperProcess.stdin.write(textToSpeak);
        piperProcess.stdin.end();
    });
}

// --- Functions to Get Phrases (from personalityConfig) ---
function getRandomPhrase(category, lang) {
    const phrasesForCategory = personalityConfig.phrases && personalityConfig.phrases[category];
    const phrasesInLang = phrasesForCategory && phrasesForCategory[lang];
    if (phrasesInLang && phrasesInLang.length > 0) {
        const randomIndex = Math.floor(Math.random() * phrasesInLang.length);
        return phrasesInLang[randomIndex];
    }
    const fallbackLang = personalityConfig.defaultLanguage || 'en';
    if (lang !== fallbackLang) {
        const fallbackPhrasesInLang = phrasesForCategory && phrasesForCategory[fallbackLang];
        if (fallbackPhrasesInLang && fallbackPhrasesInLang.length > 0){
            const randomIndex = Math.floor(Math.random() * fallbackPhrasesInLang.length);
            return fallbackPhrasesInLang[randomIndex] + ` (fallback: ${fallbackLang.toUpperCase()})`;
        }
    }
    return `(No phrase for ${category}/${lang} or fallback available)`;
}

function getMotto(lang) {
    const mottoInLang = personalityConfig.motto && personalityConfig.motto[lang];
    if (mottoInLang) return mottoInLang;
    const fallbackLang = personalityConfig.defaultLanguage || 'en';
    if (lang !== fallbackLang) {
        const fallbackMotto = personalityConfig.motto && personalityConfig.motto[fallbackLang];
        if (fallbackMotto) return fallbackMotto + ` (fallback: ${fallbackLang.toUpperCase()})`;
    }
    return "(No motto available)";
}

// --- Simulate Interactions with Promises for Sequencing ---
async function simulateConversation() {
    console.log("Simulating some interactions with Miss Pecky (Piper Voice!):");
    console.log("🔊 Make sure your volume is up! This uses Piper. 🔊");

    try {
        await missPeckySpeaksWithPiper(getRandomPhrase('greetings', activeLanguage));
        await missPeckySpeaksWithPiper(getRandomPhrase('misunderstandings', activeLanguage));
        await missPeckySpeaksWithPiper(getRandomPhrase('acknowledgements', activeLanguage));
        const quip = getRandomPhrase('jokesAndQuips', activeLanguage);
        await missPeckySpeaksWithPiper(quip);
        console.log(`Miss Pecky's Motto: ${getMotto(activeLanguage)}`);
        await missPeckySpeaksWithPiper(getRandomPhrase('farewells', activeLanguage));
        console.log("----------------------------------------------------");
        console.log("✅ Piper TTS Speech simulation completed.");
    } catch (error) {
        console.error("Piper TTS Conversation simulation FAILED:", error.message);
    }
}

// Start the simulation
if (require.main === module) {
    simulateConversation();
}