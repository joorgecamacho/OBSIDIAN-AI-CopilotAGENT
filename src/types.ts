/** Shared TypeScript types for Obsidian Agent */

// ── LLM Provider ──────────────────────────────────────────────

export type ProviderType = "ollama" | "custom";

export interface AgentSettings {
	provider: ProviderType;
	// Ollama
	ollamaBaseUrl: string;
	ollamaModel: string;
	// Custom OpenAI-compatible API
	customBaseUrl: string;
	customApiKey: string;
	customModel: string;
	// Agent
	systemPrompt: string;
}

// ── Multimodal content ────────────────────────────────────────

export interface TextContentPart {
	type: "text";
	text: string;
}

export interface ImageContentPart {
	type: "image_url";
	image_url: { url: string; detail?: "low" | "high" | "auto" };
}

export type ContentPart = TextContentPart | ImageContentPart;

// ── Chat messages ─────────────────────────────────────────────

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
	role: ChatRole;
	content: string | ContentPart[] | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
}

// ── Tool calling ──────────────────────────────────────────────

export interface ToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string; // JSON-encoded
	};
}

export interface ToolDefinition {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface ToolResult {
	success: boolean;
	result: string;
	pendingChange?: PendingChange;
}

// ── UI ────────────────────────────────────────────────────────

export interface DisplayMessage {
	id: string;
	role: "user" | "assistant" | "tool-result";
	content: string;
	timestamp: number;
	toolName?: string;
	pendingChange?: PendingChange
}

export interface PendingChange {
	path: string;
	newContent: string;
	oldContent: string | null;
}

// ── Attachments ───────────────────────────────────────────────

export type AttachmentType = "image" | "pdf";

export interface Attachment {
	type: AttachmentType;
	fileName: string;
	/** For images: data URI (data:image/png;base64,...). For PDFs: extracted text. */
	data: string;
}