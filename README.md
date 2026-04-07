# Obsidian Agent

<p align="left">
  <img src="https://img.shields.io/badge/Obsidian-483699?style=for-the-badge&logo=obsidian&logoColor=white" alt="Obsidian" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

A powerful, multimodal AI assistant directly integrated into your Obsidian vault. It acts as an autonomous agent that can read your notes, search your vault, modify files across multiple steps, and understand images or PDFs—all while keeping you in complete control through an intuitive review dashboard.

![Demo](demo.gif)

> *Obsidian Agent in action*

## Features

- **Interactive Chat Sidebar**: A clean, responsive chat interface living right in your Obsidian sidebar.
- **Agentic Workflow**: The AI proactively acts on user instructions. It can search for files, read their content, list folders, and proactively write or edit markdown files to complete complex tasks.
- **Batched Diff Review**: Instead of silently altering your vault or pausing after every small edit, the agent batches its proposed changes. You review them in a unified "Pending array" where you can Accept or Reject each file modification before it applies.
- **Multimodal Vision Support**: 
  - Use `Cmd/Ctrl + Shift + A` to attach the active image (`.png`, `.jpg`, etc.) directly to the chat context.
  - The agent can analyze diagrams, handwritten notes, and photos *(Requires a vision-capable model)*.
- **PDF Extraction**: 
  - Attach a PDF to the chat to extract its text as context.
  - Alternatively, ask the agent to "read my biology.pdf notes." It will autonomously locate it, parse it via `pdf-parse`, and utilize the content.
- **In-note Context Referencing**: Highlight any text in your active note and press `Cmd/Ctrl + Shift + L` to reference it. A reference chip is added to your prompt, allowing the agent to understand exactly what you are referring to.
- **Collapsible Tool Logs**: The agent's internal tool-calls and processing steps are nested inside a clean, collapsible view, maintaining a professional and uncluttered UI.
- **Universal API**: Out of the box, it supports locally hosted models via Ollama or any OpenAI-compatible REST API endpoint (OpenAI, MiniMax, Groq, OpenRouter, etc.).

## Installation

### Build from Source
To compile the plugin yourself:
```bash
git clone https://github.com/YOUR_USERNAME/OBSIDIAN-AI-CopilotAGENT.git
cd OBSIDIAN-AI-CopilotAGENT
npm install
npm run build
```
Copy `main.js`, `styles.css`, and `manifest.json` to your `.obsidian/plugins/obsidian-agent/` directory.

## Configuration

Navigate to Obsidian Settings > **Obsidian Agent**:

1. **Provider**: Choose between **Ollama** (local processing) or **Custom API** (OpenAI compatible).
2. **Base URL**: 
   - For Ollama: Typically `http://127.0.0.1:11434`
   - For OpenAI: `https://api.openai.com/v1`
   - For Custom Endpoints: Provide the respective API endpoint (e.g., MiniMax, Groq).
3. **Model ID**: Enter the exact model name identifier.
4. **API Key**: If using a Custom API, input your Bearer token. This is not required for standard local Ollama setups.
5. **System Prompt**: Customize the general guidelines and personality of your assistant.

## Commands and Hotkeys

| Command | Default Hotkey | Description |
|---|---|---|
| **Open Agent Chat** | - | Opens the right sidebar containing the Agent interface. |
| **Chat with current selection** | `Cmd/Ctrl + Shift + L` | Sends the active highlighted text as context directly to the chat input. |
| **Attach active file to chat** | `Cmd/Ctrl + Shift + A` | Instantly attaches the currently open file (PDF or Image) to your next message. |

## Technical Stack

- Developed in **TypeScript**.
- Styling leverages native Obsidian UI tokens via pure CSS.
- Bundled using `esbuild`.
- Employs `pdf-parse` (v2) for reliable local PDF extraction without external dependencies.
- Features a custom built-in Diff Viewer to safely review AI modifications against local file versions.

## Contributing

Issues and Pull Requests are deeply appreciated. The goal of this plugin is to construct the most robust, context-aware agentic workflow for the Obsidian ecosystem without relying on locked-in subscription services.

## License

MIT License.
