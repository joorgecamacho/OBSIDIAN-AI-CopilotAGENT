import { App } from "obsidian";
import type { AgentSettings, Attachment, ChatMessage, ContentPart, DisplayMessage, PendingChange, ToolCall } from "../types";
import { LLMProvider } from "./LLMProvider";
import { VaultTools } from "../tools/VaultTools";

const MAX_TOOL_ITERATIONS = 10;

/**
 * Orchestrates the agent loop:
 *   user message → LLM → (tool calls → execute → LLM)* → final response
 */
export class AgentService {
	private llm: LLMProvider;
	private tools: VaultTools;
	private history: ChatMessage[] = [];
	private systemPrompt: string;

	constructor(app: App, settings: AgentSettings) {
		this.llm = new LLMProvider(settings);
		this.tools = new VaultTools(app);
		this.systemPrompt = settings.systemPrompt;
	}

	/** Update when settings change. */
	updateSettings(settings: AgentSettings): void {
		this.llm.updateSettings(settings);
		this.systemPrompt = settings.systemPrompt;
	}

	/** Clear conversation history. */
	clearHistory(): void {
		this.history = [];
	}

	/**
	 * Send a user message and run the full agent loop.
	 * Calls `onUpdate` each time a new display message is produced.
	 * Accepts optional attachments (images/PDFs).
	 */
	async sendMessage(
		userMessage: string,
		onUpdate: (msg: DisplayMessage) => void,
		attachments?: Attachment[]
	): Promise<void> {
		// Build the user message content — multimodal if attachments are present
		const hasImages = attachments?.some(a => a.type === "image") ?? false;
		const pdfTexts = attachments?.filter(a => a.type === "pdf") ?? [];

		// Prepend PDF/MD text as context to the user's message
		let textContent = userMessage;
		const textAttachments = attachments?.filter(a => a.type === "pdf" || a.type === "markdown") ?? [];

		if (textAttachments.length > 0) {
			const textContext = textAttachments.map(a =>
				`[Content from "${a.fileName}"]:\n${a.data}`
			).join("\n\n");
			textContent = `${textContext}\n\nUser Request: ${textContent}`;
		}

		if (hasImages) {
			// Build multimodal content array
			const parts: ContentPart[] = [{ type: "text", text: textContent }];
			for (const att of (attachments ?? [])) {
				if (att.type === "image") {
					parts.push({
						type: "image_url",
						image_url: { url: att.data, detail: "auto" },
					});
				}
			}
			this.history.push({ role: "user", content: parts });
		} else {
			this.history.push({ role: "user", content: textContent });
		}

		const toolDefs = VaultTools.getDefinitions();

		let iterations = 0;
		while (iterations < MAX_TOOL_ITERATIONS) {
			iterations++;

			// Build messages: system + history
			const messages: ChatMessage[] = [
				{ role: "system", content: this.systemPrompt },
				...this.history,
			];

			const response = await this.llm.chatCompletion(messages, toolDefs);
			const choice = response.choices[0];

			if (!choice) {
				const errorMsg = this.makeDisplayMessage("assistant", "No response from the model. Please check your LLM configuration.");
				onUpdate(errorMsg);
				this.history.push({ role: "assistant", content: errorMsg.content });
				return;
			}

			const assistantMessage = choice.message;

			// Check for tool calls
			if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
				// Add assistant message with tool calls to history
				this.history.push({
					role: "assistant",
					content: assistantMessage.content,
					tool_calls: assistantMessage.tool_calls as ToolCall[],
				});

				// Execute each tool call
				for (const toolCall of assistantMessage.tool_calls) {
					const fnName = toolCall.function.name;
					let args: Record<string, unknown>;
					try {
						args = JSON.parse(toolCall.function.arguments);
					} catch {
						args = {};
					}

					// Show tool execution to user
					const toolMsg = this.makeDisplayMessage(
						"tool-result",
						`🔧 **${fnName}**(${JSON.stringify(args)})`,
						fnName
					);
					onUpdate(toolMsg);

					// Execute
					const result = await this.tools.execute(fnName, args);

					// Show result
					const resultMsg = this.makeDisplayMessage(
						"tool-result",
						result.success
							? `✅ ${result.result}`
							: `❌ ${result.result}`,
						fnName,
						result.pendingChange
					);
					onUpdate(resultMsg);

					// Add tool result to history
					this.history.push({
						role: "tool",
						content: result.result,
						tool_call_id: toolCall.id,
						name: fnName,
					});
				}

				// Continue loop — model needs to process tool results
				continue;
			}

			// No tool calls — final text response
			const content = assistantMessage.content || "";
			this.history.push({ role: "assistant", content });
			const displayMsg = this.makeDisplayMessage("assistant", content);
			onUpdate(displayMsg);
			return;
		}

		// Safety: max iterations reached
		const safetyMsg = this.makeDisplayMessage("assistant", "⚠️ Maximum tool iterations reached. Please try again.");
		onUpdate(safetyMsg);
		this.history.push({ role: "assistant", content: safetyMsg.content });
	}

	private makeDisplayMessage(
		role: DisplayMessage["role"],
		content: string,
		toolName?: string,
		pendingChange?: PendingChange
	): DisplayMessage {
		return {
			id: crypto.randomUUID(),
			role,
			content,
			timestamp: Date.now(),
			toolName,
			pendingChange,
		};
	}

	public async applyPendingChange(path: string, pendingChange: PendingChange): Promise<void> {
		await this.tools.applyPendingChange(path, pendingChange)
	}
}
