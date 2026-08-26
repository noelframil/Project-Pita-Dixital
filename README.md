# Project Pita Dixital — B2B Omnichannel AI Middleware

> “We shape our tools, and thereafter our tools shape us.”  
> — Marshall McLuhan

Project Pita Dixital has evolved from a standalone voice experiment into a **production-grade B2B Omnichannel AI Middleware**.

Developed in **Node.js + Fastify + TypeScript**, this architecture acts as the central brain between your company's channels (WhatsApp, Web, Email, Telegram) and advanced Large Language Models (Anthropic, OpenAI, Ollama), providing state-of-the-art security, semantic memory, rate limiting, and observability out of the box.

---

## 🚀 Core Capabilities

- **🔒 Enterprise Security & SSRF Defense:** Hardened HTTP Tool execution, HMAC payload verification, double-key rate limiting (per tenant and user), and strict prompt injection guards.
- **🧠 Semantic & Working Memory:** Hybrid RAG (pgvector HNSW) combined with ongoing working memory and token budget constraints. Tracks facts and revisions transparently.
- **🤖 Multi-Agent ReAct Architecture:** Advanced orchestration with specialized sub-agents, autonomous self-reflection (critic agent), and tool loop limits to prevent runaway costs.
- **🌍 Omnichannel Native:** WhatsApp, Telegram, and Web chat adapters built-in with proper multimodal support (audio/images).
- **⏱️ Prompt Caching:** Ephemeral cache integration (Anthropic) for massive latency reduction and token cost savings on long context windows.
- **🗃️ Autonomous Evolution:** Nightly cron jobs for semantic memory consolidation and autonomous maintenance.

---

## 🏗️ Architecture Overview

```text
[ WhatsApp / Telegram / Web ]  →  [ API Central ]  →  [ Anthropic / OpenAI / Ollama ]
                                       │
                                       ├─ Autenticación y Rate Limiting (Redis)
                                       ├─ Carga de Configuración y Personalidad
                                       ├─ Recuperación Híbrida (RAG + pgvector)
                                       ├─ Inyección de Memoria Semántica
                                       ├─ Bucle Multi-Agente (ReAct)
                                       └─ Registro de Trazas (LLMOps) y Costes
```

## 🛠️ Getting Started

Navigate to `services/api` to interact with the core engine.

```bash
cd services/api
npm install
cp .env.staging.example .env

# Startup the infrastructure (PostgreSQL, Redis)
npm run infra:up

# Run the core middleware
npm run dev
```

For a detailed development changelog and architectural decisions, see [README-JAVI.md](./README-JAVI.md) and the `services/api/README.md`.
