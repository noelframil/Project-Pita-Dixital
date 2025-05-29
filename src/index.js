// src/index.js
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process'); // To run external commands like Piper
const player = require('play-sound')(opts = {}); // Sound player

console.log("🐔 Cluck, cluck! Miss Pecky (Node.js) is warming up her LOCAL HIGH-QUALITY voice with Piper TTS!");
console.log("----------------------------------------------------");

// --- Paths for Piper TTS ---
const piperRootPath = path.join(process.cwd(), 'tts_engine', 'piper'); // Main folder containing Piper executable and its libs
const piperExecutablePath = path.join(piperRootPath, 'piper');        // The 'piper' executable
const piperVoicesBasePath = path.join(piperRootPath, 'voices');       // Voices within the 'piper' folder structure

// --- Load Personality Configuration ---
let personalityConfig = {};
const defaultPersonality = { // Fallback if personality.json fails
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

// --- Language Configuration ---
const currentSystemLang = process.env.LANG ? process.env.LANG.substring(0, 2).toLowerCase() : null;
let resolvedLang = personalityConfig.defaultLanguage || 'en';

if (personalityConfig.motto && Object.keys(personalityConfig.motto).length > 0) { // Check if personality has languages
    const supportedLanguages = Object.keys(personalityConfig.motto);
    if (currentSystemLang && supportedLanguages.includes(currentSystemLang)) {
        resolvedLang = currentSystemLang;
    } else if (!supportedLanguages.includes(resolvedLang) && supportedLanguages.includes('en')) {
        // If default from config is not in the list, but 'en' is, use 'en'
        resolvedLang = 'en';
    } else if (!supportedLanguages.includes(resolvedLang)) {
        // If default is not supported, use the first available language from the config, or 'en' as last resort
        resolvedLang = supportedLanguages[0] || 'en';
    }
} else {
    // If personalityConfig.motto is empty or undefined (e.g. defaultPersonality was used and is minimal)
    resolvedLang = defaultPersonality.defaultLanguage || 'en';
}
const activeLanguage = resolvedLang;

console.log(`🗣️  Active language for Miss Pecky (Piper TTS): ${activeLanguage.toUpperCase()}`);
console.log("----------------------------------------------------");

// --- Piper TTS Speech Function ---
async function missPeckySpeaksWithPiper(textToSpeak) {
    console.log(`${personalityConfig.assistantName} (Piper Voice) says: "${textToSpeak}"`);

    let modelFileName; // Just the filename, e.g., 'es_ES-sharvard-medium.onnx'

    // IMPORTANT: Update these model filenames to match what you downloaded into tts_engine/piper/voices/
    if (activeLanguage === 'es') {
        modelFileName = 'es_ES-davefx-medium.onnx'; 
    } else if (activeLanguage === 'en') {
        modelFileName = 'en_US-amy-medium.onnx'; // EXAMPLE: US English voice
        // modelFileName = 'en_GB-southern_english_female-medium.onnx'; // EXAMPLE: UK English voice
    } else if (activeLanguage === 'gl') {
        console.warn("⚠️ No specific Galician voice model for Piper found in config, defaulting to Spanish.");
        modelFileName = 'es_ES-sharvard-medium.onnx'; // EXAMPLE: Default to Spanish for Galician
    } else {
        console.warn(`⚠️ No Piper voice model configured for language: ${activeLanguage}. Defaulting to US English.`);
        modelFileName = 'en_US-lessac-medium.onnx'; // EXAMPLE: Fallback
    }

    const modelPath = path.join(piperVoicesBasePath, modelFileName);
    const modelConfigPath = modelPath + ".json"; // Piper expects config next to the model

    if (!fs.existsSync(modelPath)) {
        console.error(`❌ Piper voice model not found at: ${modelPath}`);
        console.error("👉 Please ensure you have downloaded the voice model and placed it in the correct 'voices' subfolder, and that the filename in index.js matches.");
        return Promise.reject(new Error(`Piper model not found: ${modelPath}`));
    }
    // Optional: Check for .json config file, though Piper might not always require it to be explicitly passed if next to .onnx
    if (!fs.existsSync(modelConfigPath)) {
        console.warn(`💡 Voice model config file not found at: ${modelConfigPath}. Piper might still work if the model doesn't strictly need it or finds it automatically.`);
    }

    const outputWavFile = path.join(process.cwd(), 'output_piper.wav'); // Piper outputs WAV

    const piperArgs = [
        '--model', modelPath,
        '--output-file', outputWavFile
        // If your specific voice model *requires* its .json config to be passed, add:
        // '--config', modelConfigPath
        // If Piper has trouble finding espeak-ng-data (usually not an issue if it's alongside piper executable):
        // '--espeak-data', path.join(piperRootPath, 'espeak-ng-data')
    ];

    return new Promise((resolve, reject) => {
        const piperProcess = execFile(piperExecutablePath, piperArgs, (error, stdout, stderr) => {
            if (error) {
                console.error(`Piper TTS execution error: ${error.message}`);
                if (stderr) console.error(`Piper stderr: ${stderr.trim()}`);
                if (stdout) console.error(`Piper stdout: ${stdout.trim()}`);
                reject(error);
                return;
            }
            if (stderr && stderr.trim()) { console.log(`Piper info (stderr): ${stderr.trim()}`); }
            // if (stdout && stdout.trim()) { console.log(`Piper stdout: ${stdout.trim()}`); } // Often empty on success

            if (!fs.existsSync(outputWavFile) || fs.statSync(outputWavFile).size === 0) {
                const errorMessage = `❌ Piper ran, but output file "${outputWavFile}" was not created or is empty. Check Piper logs above.`;
                console.error(errorMessage);
                reject(new Error(errorMessage));
                return;
            }
            console.log(`Audio content written to file: ${outputWavFile}`);

            player.play(outputWavFile, (err) => {
                if (err) {
                    console.error(`Error playing audio file ${outputWavFile}:`, err);
                    reject(err);
                } else {
                    console.log(`Finished playing: ${outputWavFile}`);
                    // Optionally, delete the temporary file after playing
                    // fs.unlink(outputWavFile, (unlinkErr) => { if (unlinkErr) console.error("Error deleting temp WAV:", unlinkErr); });
                    resolve();
                }
            });
        });

        piperProcess.stdin.on('error', (err) => {
            // Handle errors on stdin, e.g. if Piper closes too quickly
            console.error('Error writing to Piper stdin:', err);
            // It might be useful to kill the process if stdin errors out,
            // though execFile's callback should also catch Piper exiting with an error.
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
    // Fallback logic
    const fallbackLang = personalityConfig.defaultLanguage || 'en';
    if (lang !== fallbackLang) { // Avoid infinite loop if default lang also fails for this category
        const fallbackPhrasesInLang = phrasesForCategory && phrasesForCategory[fallbackLang];
        if (fallbackPhrasesInLang && fallbackPhrasesInLang.length > 0){
            const randomIndex = Math.floor(Math.random() * fallbackPhrasesInLang.length);
            return fallbackPhrasesInLang[randomIndex] + ` (fallback: ${fallbackLang.toUpperCase()})`;
        }
    }
    return `(No phrase for ${category}/${lang} or fallback available)`; // Ultimate fallback
}

function getMotto(lang) {
    const mottoInLang = personalityConfig.motto && personalityConfig.motto[lang];
    if (mottoInLang) return mottoInLang;
    // Fallback logic
    const fallbackLang = personalityConfig.defaultLanguage || 'en';
    if (lang !== fallbackLang) {
        const fallbackMotto = personalityConfig.motto && personalityConfig.motto[fallbackLang];
        if (fallbackMotto) return fallbackMotto + ` (fallback: ${fallbackLang.toUpperCase()})`;
    }
    return "(No motto available)"; // Ultimate fallback
}

// --- Simulate Interactions with Promises for Sequencing ---
async function simulateConversation() {
    console.log("Simulating some interactions with Miss Pecky (Piper TTS Voice!):");
    console.log("🔊 Make sure your volume is up! This uses local Piper TTS. 🔊");

    try {
        await missPeckySpeaksWithPiper(getRandomPhrase('greetings', activeLanguage));
        await missPeckySpeaksWithPiper(getRandomPhrase('misunderstandings', activeLanguage));
        await missPeckySpeaksWithPiper(getRandomPhrase('acknowledgements', activeLanguage));

        const quip = getRandomPhrase('jokesAndQuips', activeLanguage);
        await missPeckySpeaksWithPiper(quip);
        console.log(`Miss Pecky's Motto: ${getMotto(activeLanguage)}`); // Motto is just logged

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