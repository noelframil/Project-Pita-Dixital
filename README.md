# 🐔 Miss Pecky — Offline Experimental Voice Assistant

> “We shape our tools, and thereafter our tools shape us.”  
> — Marshall McLuhan

Miss Pecky is not just a technical demo — it’s a **statement**.

Developed entirely in **Node.js**, powered by **Piper TTS** and running **100% offline**, this assistant merges natural language synthesis with a customizable character engine to explore the edges of **privacy-first AI**, **edge computing**, and **voice interaction without the cloud**.

---

## 🎓 Why This Project?

As a student pursuing a **double degree in International Business & Data Science (ESIC)** and **Computer Engineering (UNIR)** — with past coursework at **VU Amsterdam** and a recently done 6 weeks course made by **Imperial College London** — I’ve always been driven by the intersection of technology, society, and autonomy.

This project was born from a question:

> *Can we create expressive, character-driven, offline AI assistants that respect user privacy, are fully hackable, and feel alive — without Big Tech?*

Miss Pecky is my first step toward answering that.

---

## 🏛️ Who Should Be Interested?

**This repo is for teams and institutions thinking ahead:**

- 🇨🇭 Swiss Research & Innovation Labs:  
  ETH Zürich, EPFL, Idiap Research Institute, Hochschule Luzern
- 🌍 Global R&D Divisions:  
  IBM Research, ABB, Logitech, Siemens, Palantir, Roche, Google Research
- 🧠 AI Labs & HCI Think Tanks:  
  Those exploring **edge AI**, **offline voice interfaces**, and **digital embodiment**

---

## 🚀 Features

- ✅ 100% Offline TTS using [Piper](https://github.com/rhasspy/piper) and ONNX voice models
- 🎭 Customizable character engine (mottos, quirks, emotions, jokes)
- 🌍 Multilingual support: EN, ES, GL — with intelligent fallback handling
- 📦 Modular Node.js structure: perfect for academic R&D and rapid prototyping
- 🔒 Total data privacy: no external APIs, no telemetry, no compromises

---

## 📸 Screenshot

> "Hola, soy Miss Pecky, la gallina digital que vino a revolucionar la red."

🖥️ CLI boot log, custom voice personality config loaded, wav output played locally. No cloud. No nonsense.

---
## 🎬 Timelapse Demo

This short timelapse shows the modeling and setup of a real-time, audio-responsive chicken prototype, built with Blender and Unity.

📺 [Watch on YouTube](https://youtube.com/shorts/i5Vd32qhwSQ)

## 🎥 Demo Video #2: First Voice Test

<p align="center">
  <a href="https://www.youtube.com/shorts/b0vhIWtVDTY" target="_blank">
    <img src="https://img.youtube.com/vi/b0vhIWtVDTY/0.jpg" alt="Miss Pecky First Voice Test" width="480"/>
  </a>
</p>

This short clip is my **first live voice test** of Miss Pecky (Pita Tola) in action—fully offline, using our custom TTS pipeline. You’ll hear her Galician-accented greeting and playful “¡Pío, pío!” as she springs to life. It’s the second installment in this video series, documenting the evolution of our privacy-first, character-driven voice assistant.  

## 🛠️ How to Run

```bash
# 1. Get Piper (MacOS Apple Silicon example)
curl -LO https://github.com/rhasspy/piper/releases/latest/download/piper_macos_aarch64.tar.gz
mkdir -p tts_engine/piper
tar -xzf piper_macos_aarch64.tar.gz -C tts_engine/piper

# 2. Install a Spanish voice model
curl -L -o tts_engine/piper/voices/es_ES-davefx-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/es_ES/es_ES-davefx-medium.onnx
curl -L -o tts_engine/piper/voices/es_ES-davefx-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/es_ES/es_ES-davefx-medium.onnx.json

# 3. Install dependencies
npm install

# 4. Run Miss Pecky
node src/index.js
