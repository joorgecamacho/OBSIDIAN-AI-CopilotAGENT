import { requestUrl } from "obsidian";
import type { AgentSettings, ChatMessage, ToolDefinition } from "../types";

/**
 * Abstracts LLM API calls for both Ollama and OpenAI-compatible endpoints.
 * Uses Ollama's OpenAI-compatible /v1/chat/completions endpoint.
 */
export class LLMProvider {
	constructor(private settings: AgentSettings) {}

	/** Update settings reference (e.g. after settings change). */
	updateSettings(settings: AgentSettings): void {
		this.settings = settings;
	}

	/**
	 * Send a chat completion request with optional tool definitions.
	 * Returns the raw JSON response body.
	 */
	async chatCompletion(
		messages: ChatMessage[],
		tools?: ToolDefinition[]
	): Promise<ChatCompletionResponse> {
		const { url, headers, model } = this.getConfig();

		const body: Record<string, unknown> = {
			model,
			messages,
			stream: false,
		};
		if (tools && tools.length > 0) {
			body.tools = tools;
			body.tool_choice = "auto";
		}

		const response = await requestUrl({
			url,
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});

		return response.json as ChatCompletionResponse;
	}

	/** Build URL + headers + model depending on provider. */
	private getConfig(): { url: string; headers: Record<string, string>; model: string } {
		if (this.settings.provider === "ollama") {
			const base = this.settings.ollamaBaseUrl.replace(/\/+$/, "");
			return {
				url: `${base}/v1/chat/completions`,
				headers: { "Content-Type": "application/json" },
				model: this.settings.ollamaModel,
			};
		}

		// Custom OpenAI-compatible API
		const base = this.settings.customBaseUrl.replace(/\/+$/, "");
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.settings.customApiKey) {
			headers["Authorization"] = `Bearer ${this.settings.customApiKey}`;
		}
		return {
			url: `${base}/chat/completions`,
			headers,
			model: this.settings.customModel,
		};
	}
}

// ── Response types ────────────────────────────────────────────

export interface ChatCompletionResponse {
	id: string;
	choices: {
		index: number;
		message: {
			role: string;
			content: string | null;
			tool_calls?: {
				id: string;
				type: "function";
				function: { name: string; arguments: string };
			}[];
		};
		finish_reason: string;
	}[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}
