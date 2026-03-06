# Self-Hosted AI Chat

> A fully browser-based AI chatbot powered by WebAssembly llama.cpp — no backend, no API keys.

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://pranaymahendrakar.github.io/self-hosted-ai-chat/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Architecture

```
Browser
   |
   v
WebAssembly llama.cpp (wllama)
   |
   v
Local GGUF Model (TinyLlama / Phi-2 / Mistral / LLaMA)
```

**No backend. No API keys. Everything runs inside your browser.**

---

## Features

- **100% Private** - All inference runs locally, no data sent to servers
- **No API Keys** - Zero cloud dependencies
- **Open Source Models** - TinyLlama, Phi-2, Mistral, LLaMA (GGUF format)
- **GitHub Pages** - Static site deployment, works offline after first load
- **Local File Support** - Load your own .gguf model files from disk
- **Responsive** - Works on desktop and mobile browsers
- **Chat History** - Persisted in browser localStorage
- **Dark Theme** - GitHub-inspired dark UI

---

## Quick Start

### Option 1: GitHub Pages (Recommended)

Visit: **https://pranaymahendrakar.github.io/self-hosted-ai-chat/**

1. Click **Quick Start with TinyLlama 1.1B**
2. Wait for the model to download (~637 MB)
3. Start chatting!

### Option 2: Run Locally

```bash
git clone https://github.com/PranayMahendrakar/self-hosted-ai-chat.git
cd self-hosted-ai-chat
python -m http.server 8080
# Open: http://localhost:8080
```

---

## Supported Models

| Model | Size | Speed | Best For |
|-------|------|-------|----------|
| TinyLlama 1.1B Q4 | ~637 MB | Fast | Quick start, low RAM |
| Phi-2 Q4 | ~1.5 GB | Medium | Good balance |
| Mistral 7B Q4 | ~4.1 GB | Slow | Best quality |

You can also load any GGUF model via URL or local file upload.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| UI | Vanilla HTML/CSS/JS (no framework) |
| Inference Engine | wllama (WebAssembly llama.cpp) |
| Model Format | GGUF |
| Deployment | GitHub Pages |
| Storage | Browser localStorage |

---

## Project Structure

```
self-hosted-ai-chat/
  index.html      # Main UI: sidebar, chat area, model loader
  style.css       # Complete dark theme stylesheet
  app.js          # Core: model loading, inference, chat sessions
  README.md       # Documentation
```

---

## How It Works

**Model Loading:**
1. User selects a GGUF model (URL or local file)
2. wllama fetches and initializes the WebAssembly llama.cpp runtime
3. Model weights are loaded into browser memory (RAM)

**Inference:**
1. User message is formatted into a ChatML prompt
2. wllama runs autoregressive token generation in WASM
3. Tokens stream to the UI in real-time via onNewToken callback

**Memory Requirements:**
- 1B params Q4: ~1.5 GB RAM
- 3B params Q4: ~2.5 GB RAM
- 7B params Q4: ~5-6 GB RAM

---

## Important Limitations

- First load is slow: large models take time to download
- Uses CPU-only WASM inference (WebGPU acceleration optional)
- Very large models (13B+) may crash the browser tab
- GitHub Actions cannot run large model inference (use 1B-3B models)

---

## Credits

- [llama.cpp](https://github.com/ggerganov/llama.cpp) by Georgi Gerganov
- [wllama](https://github.com/ngxson/wllama) WebAssembly wrapper
- [TheBloke](https://huggingface.co/TheBloke) for GGUF model quantizations

---

*Runs 100% in your browser. No servers needed.*
