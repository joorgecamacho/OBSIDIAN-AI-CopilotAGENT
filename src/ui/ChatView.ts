import { ItemView, MarkdownRenderer, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type ObsidianAgent from "../main";
import type { Attachment, DisplayMessage, PendingChange } from "../types";
import { AgentService } from "../agent/AgentService";
import { DiffView, DIFF_VIEW_TYPE } from "./DiffView";
import { PDFParse } from "pdf-parse";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const PDF_EXTENSIONS = ["pdf"];
const MD_EXTENSIONS = ["md", "txt", "canvas"];

export const CHAT_VIEW_TYPE = "obsidian-agent-chat";

export interface ContextReference {
	file: string;
	content: string;
	startLine: number;
	endLine: number;
}

export class ChatView extends ItemView {
	private agent: AgentService;
	private messagesContainer: HTMLElement;
	private activeReferences: ContextReference[] = [];
	private activeAttachments: Attachment[] = [];
	private referencesContainer: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private isProcessing = false;

	constructor(leaf: WorkspaceLeaf, private plugin: ObsidianAgent) {
		super(leaf);
		this.agent = new AgentService(this.app, plugin.settings);
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Agent Chat";
	}

	getIcon(): string {
		return "bot";
	}

	/** Called when settings change externally. */
	refreshSettings(): void {
		this.agent.updateSettings(this.plugin.settings);
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("agent-chat-container");

		// ── Header ────────────────────────────────────────────
		const header = container.createDiv({ cls: "agent-chat-header" });

		const headerLeft = header.createDiv({ cls: "agent-chat-header-left" });
		const iconSpan = headerLeft.createSpan({ cls: "agent-chat-header-icon" });
		setIcon(iconSpan, "bot");
		headerLeft.createSpan({ text: "Agent Chat", cls: "agent-chat-header-title" });

		const headerActions = header.createDiv({ cls: "agent-chat-header-actions" });
		const clearBtn = headerActions.createEl("button", {
			cls: "agent-chat-clear-btn",
			attr: { "aria-label": "New conversation" },
		});
		setIcon(clearBtn, "rotate-ccw");
		clearBtn.addEventListener("click", () => {
			this.agent.clearHistory();
			this.messagesContainer.empty();
			this.addWelcomeMessage();
		});

		// ── Messages area ─────────────────────────────────────
		this.messagesContainer = container.createDiv({ cls: "agent-chat-messages" });
		this.addWelcomeMessage();

		// ── Input area ────────────────────────────────────────
		const inputArea = container.createDiv({ cls: "agent-chat-input-area" });

		// References container sits inside input area above the actual textarea
		this.referencesContainer = inputArea.createDiv({ cls: "agent-chat-references" });
		this.referencesContainer.style.display = "none";

		const inputWrapper = inputArea.createDiv({ cls: "agent-chat-input-wrapper" });

		// Attach file button
		const attachBtn = inputWrapper.createEl("button", {
			cls: "agent-chat-attach-btn",
			attr: { "aria-label": "Attach file (image, PDF or MD)" },
		});
		setIcon(attachBtn, "paperclip");
		attachBtn.addEventListener("click", () => this.handleAttachFile());

		this.inputEl = inputWrapper.createEl("textarea", {
			cls: "agent-chat-input",
			attr: {
				placeholder: "Ask the agent anything…",
				rows: "1",
			},
		});

		this.sendBtn = inputWrapper.createEl("button", {
			cls: "agent-chat-send-btn",
			attr: { "aria-label": "Send message" },
		});
		setIcon(this.sendBtn, "send");

		// Events
		this.sendBtn.addEventListener("click", () => this.handleSend());
		this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		// Auto-resize textarea
		this.inputEl.addEventListener("input", () => {
			this.inputEl.style.height = "auto";
			this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 150) + "px";
		});
	}

	async onClose(): Promise<void> {
		// Nothing to clean up
	}

	// ── Public methods ────────────────────────────────────────

	public addReference(file: string, content: string, startLine: number, endLine: number): void {
		this.activeReferences.push({ file, content, startLine, endLine });
		this.renderReferences();
		this.inputEl.focus();
	}

	public async addFileAttachment(file: TFile): Promise<void> {
		const ext = file.extension.toLowerCase();
		if (IMAGE_EXTENSIONS.includes(ext)) {
			const buffer = await this.app.vault.readBinary(file);
			const base64 = this.arrayBufferToBase64(buffer);
			const mimeType = ext === "jpg" ? "jpeg" : ext;
			this.activeAttachments.push({
				type: "image",
				fileName: file.name,
				data: `data:image/${mimeType};base64,${base64}`,
			});
		} else if (PDF_EXTENSIONS.includes(ext)) {
			const buffer = await this.app.vault.readBinary(file);
			try {
				PDFParse.setWorker("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs");
				const parser = new PDFParse({ data: new Uint8Array(buffer) });
				const result = await parser.getText();
				await parser.destroy();
				const text = result.text.trim();
				const MAX_CHARS = 30000;
				const truncated = text.length > MAX_CHARS
					? text.substring(0, MAX_CHARS) + "\n[... truncated ...]"
					: text;
				this.activeAttachments.push({
					type: "pdf",
					fileName: file.name,
					data: truncated || "[No extractable text in this PDF]",
				});
			} catch (err) {
				this.activeAttachments.push({
					type: "pdf",
					fileName: file.name,
					data: `[Error reading PDF: ${err instanceof Error ? err.message : String(err)}]`,
				});
			}
		} else if (MD_EXTENSIONS.includes(ext)) {
			const text = await this.app.vault.read(file);
			const MAX_CHARS = 100000;
			const truncated = text.length > MAX_CHARS
				? text.substring(0, MAX_CHARS) + "\n[... truncated ...]"
				: text;
			this.activeAttachments.push({
				type: "markdown",
				fileName: file.name,
				data: truncated || "[Empty file]",
			});
		} else {
			return; // Unsupported type, silently ignore
		}
		this.renderReferences();
		this.inputEl.focus();
	}

	// ── Private methods ───────────────────────────────────────

	private renderReferences(): void {
		this.referencesContainer.empty();
		
		const hasAny = this.activeReferences.length > 0 || this.activeAttachments.length > 0;
		if (!hasAny) {
			this.referencesContainer.style.display = "none";
			return;
		}

		this.referencesContainer.style.display = "flex";

		// Render text references
		this.activeReferences.forEach((ref, index) => {
			const chip = this.referencesContainer.createDiv({ cls: "agent-chat-reference-chip" });
			
			const label = chip.createSpan({ text: `${ref.file} (${ref.startLine}:${ref.endLine})` });
			label.title = ref.content;

			const closeBtn = chip.createSpan({ cls: "ref-close" });
			setIcon(closeBtn, "x");
			closeBtn.addEventListener("click", () => {
				this.activeReferences.splice(index, 1);
				this.renderReferences();
			});
		});

		// Render file attachments
		this.activeAttachments.forEach((att, index) => {
			const chip = this.referencesContainer.createDiv({ cls: "agent-chat-reference-chip" });
			const icon = att.type === "image" ? "image" : "file-text";
			const iconEl = chip.createSpan({ cls: "ref-icon" });
			setIcon(iconEl, icon);
			chip.createSpan({ text: att.fileName });

			const closeBtn = chip.createSpan({ cls: "ref-close" });
			setIcon(closeBtn, "x");
			closeBtn.addEventListener("click", () => {
				this.activeAttachments.splice(index, 1);
				this.renderReferences();
			});
		});
	}

	private async handleAttachFile(): Promise<void> {
		// Try to attach the currently active file
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const ext = activeFile.extension.toLowerCase();
		if (!IMAGE_EXTENSIONS.includes(ext) && !PDF_EXTENSIONS.includes(ext) && !MD_EXTENSIONS.includes(ext)) {
			// Not a supported file type — silently ignore
			return;
		}

		// Don't add duplicates
		if (this.activeAttachments.some(a => a.fileName === activeFile.name)) return;

		await this.addFileAttachment(activeFile);
	}

	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]!);
		}
		return btoa(binary);
	}

	private addWelcomeMessage(): void {
		const welcome = this.messagesContainer.createDiv({ cls: "agent-chat-welcome" });
		const iconEl = welcome.createDiv({ cls: "agent-chat-welcome-icon" });
		setIcon(iconEl, "bot");
		welcome.createEl("h3", { text: "Hello! I'm your vault agent." });
		welcome.createEl("p", {
			text: "Ask me to create, read, edit, or search files in your vault. I can also answer questions about your notes.",
		});

		const chips = welcome.createDiv({ cls: "agent-chat-chips" });
		const suggestions = [
			"📄 List all my files",
			"🔍 Search for a topic",
			"✍️ Create a new note",
			"📖 Read the active file",
		];
		for (const text of suggestions) {
			const chip = chips.createEl("button", { text, cls: "agent-chat-chip" });
			chip.addEventListener("click", () => {
				this.inputEl.value = text.replace(/^.{2}\s/, ""); // strip emoji
				this.handleSend();
			});
		}
	}

	private async handleSend(): Promise<void> {
		const text = this.inputEl.value.trim();
		const hasContext = this.activeReferences.length > 0 || this.activeAttachments.length > 0;
		if ((!text && !hasContext) || this.isProcessing) return;

		this.inputEl.value = "";
		this.inputEl.style.height = "auto";

		// Bundle references if present
		let finalPrompt = text;
		if (this.activeReferences.length > 0) {
			const refsText = this.activeReferences.map(ref => 
				`[Reference Context from ${ref.file} (Lines ${ref.startLine}-${ref.endLine})]:\n${ref.content}`
			).join("\n\n");
			finalPrompt = `${refsText}\n\nUser Request: ${text}`;
		}

		// Capture attachments before clearing
		const attachmentsToSend = [...this.activeAttachments];

		// Clear references & attachments from UI instantly after sending
		this.activeReferences = [];
		this.activeAttachments = [];
		this.renderReferences();

		// Show user message with attachment indicators
		let userDisplay = text || "(Sent context)";
		if (attachmentsToSend.length > 0) {
			const names = attachmentsToSend.map(a => `📎 ${a.fileName}`).join(", ");
			userDisplay = text ? `${text}\n${names}` : names;
		}
		this.addMessageBubble("user", userDisplay);

		// Show thinking indicator
		const thinkingEl = this.addThinkingIndicator();

		this.isProcessing = true;
		this.sendBtn.disabled = true;
		this.inputEl.disabled = true;

		try {
			let turnWrapper: HTMLElement | null = null;
			let toolsDetails: HTMLDetailsElement | null = null;
			let pendingChangesList: HTMLElement | null = null;
			let pendingChangeCount = 0;

			const getOrCreateTurnWrapper = () => {
				if (!turnWrapper) {
					if (thinkingEl.parentElement) thinkingEl.remove();
					turnWrapper = this.messagesContainer.createDiv({ cls: "agent-chat-msg agent-chat-msg-assistant agent-chat-turn" });
				}
				return turnWrapper;
			};

			const getOrCreateToolsDetails = () => {
				const wrapper = getOrCreateTurnWrapper();
				if (!toolsDetails) {
					toolsDetails = wrapper.createEl("details", { cls: "agent-chat-tools-details" });
					// The details will be inserted at the top of the turn wrapper
					wrapper.prepend(toolsDetails);
					const summary = toolsDetails.createEl("summary", { text: "⚙️ Agent actions tool logs (1)" });
					summary.addClass("agent-chat-tools-summary");
					toolsDetails.dataset.count = "1";
				} else {
					let count = parseInt(toolsDetails.dataset.count || "1") + 1;
					toolsDetails.dataset.count = String(count);
					const summary = toolsDetails.querySelector("summary");
					if (summary) summary.textContent = `⚙️ Agent actions tool logs (${count})`;
				}
				return toolsDetails;
			};

			const getOrCreatePendingChangesList = () => {
				const wrapper = getOrCreateTurnWrapper();
				if (!pendingChangesList) {
					pendingChangesList = wrapper.createDiv({ cls: "agent-chat-pending-changes-list" });
					pendingChangesList.createEl("h4", { text: "📝 1 File Pending Review" });
				}
				return pendingChangesList;
			};

			await this.agent.sendMessage(finalPrompt, (msg: DisplayMessage) => {
				
				if (msg.role === "tool-result") {
					const details = getOrCreateToolsDetails();
					
					const toolLogWrap = details.createDiv({ cls: "agent-chat-tool-log-item" });
					
					const badge = toolLogWrap.createDiv({ cls: "agent-chat-tool-badge" });
					setIcon(badge, "wrench");
					if (msg.toolName) {
						badge.createSpan({ text: msg.toolName });
					}
					
					const bubble = toolLogWrap.createDiv({ cls: "agent-chat-bubble agent-chat-bubble-tool" });
					MarkdownRenderer.render(this.app, msg.content, bubble, "", this.plugin);

					if (msg.pendingChange) {
						const trappedChange = msg.pendingChange;
						const list = getOrCreatePendingChangesList();
						pendingChangeCount++;
						const heading = list.querySelector("h4");
						if (heading) {
							heading.textContent = `📝 ${pendingChangeCount} File${pendingChangeCount > 1 ? 's' : ''} Pending Review`;
						}

						const item = list.createDiv({ cls: "pending-change-item" });
						
						const left = item.createDiv({ cls: "pending-change-item-left" });
						setIcon(left, "file-diff");
						left.createSpan({ text: trappedChange.path });

						const reviewBtn = item.createEl("button", { text: "🔍 Review", cls: "pending-change-review-btn" });
						reviewBtn.addEventListener("click", async () => {
							const leaf = this.app.workspace.getLeaf('tab');
							await leaf.setViewState({ type: DIFF_VIEW_TYPE, active: true });
							this.app.workspace.revealLeaf(leaf);

							const view = leaf.view as DiffView;
							view.setDiffData(
								trappedChange,
								async () => {
									await this.agent.applyPendingChange(trappedChange.path, trappedChange);
									item.remove();
									pendingChangeCount--;
									if (pendingChangeCount <= 0 && list.parentElement) { 
										list.remove(); 
									} else if (heading) { 
										heading.textContent = `📝 ${pendingChangeCount} File${pendingChangeCount > 1 ? 's' : ''} Pending Review`; 
									}
								},
								() => {
									item.remove();
									pendingChangeCount--;
									if (pendingChangeCount <= 0 && list.parentElement) { 
										list.remove(); 
									} else if (heading) { 
										heading.textContent = `📝 ${pendingChangeCount} File${pendingChangeCount > 1 ? 's' : ''} Pending Review`; 
									}
								}
							);
						});
					}
				} else {
					// Assistant text message
					const wrapper = getOrCreateTurnWrapper();
					const bubble = wrapper.createDiv({ cls: "agent-chat-bubble assistant-text" });
					MarkdownRenderer.render(this.app, msg.content, bubble, "", this.plugin);
					
					// If there is a pending changes list, push it to the very bottom so text stays above
					if (pendingChangesList && pendingChangesList.parentElement) {
						wrapper.appendChild(pendingChangesList);
					}
				}

				this.scrollToBottom();
			}, attachmentsToSend);
		} catch (err) {
			if (thinkingEl.parentElement) {
				thinkingEl.remove();
			}
			const errMsg = err instanceof Error ? err.message : String(err);
			this.addMessageBubble("assistant", `❌ **Error:** ${errMsg}\n\nPlease check your LLM settings.`);
		} finally {
			this.isProcessing = false;
			this.sendBtn.disabled = false;
			this.inputEl.disabled = false;
			this.inputEl.focus();
		}
	}

	private addMessageBubble(
		role: "user" | "assistant" | "tool-result",
		content: string,
		toolName?: string,
		pendingChange?: PendingChange // Keeping signature for backwards compatibility/errors
	): void {
		// Remove welcome if present
		const welcome = this.messagesContainer.querySelector(".agent-chat-welcome");
		if (welcome) welcome.remove();

		const wrapper = this.messagesContainer.createDiv({
			cls: `agent-chat-msg agent-chat-msg-${role}`,
		});

		if (role === "tool-result") {
			const badge = wrapper.createDiv({ cls: "agent-chat-tool-badge" });
			setIcon(badge, "wrench");
			if (toolName) {
				badge.createSpan({ text: toolName });
			}
		}

		const bubble = wrapper.createDiv({ cls: "agent-chat-bubble" });

		if (role === "user") {
			bubble.textContent = content;
		} else {
			MarkdownRenderer.render(this.app, content, bubble, "", this.plugin);
		}

		this.scrollToBottom();
	}

	private addThinkingIndicator(): HTMLElement {
		const wrapper = this.messagesContainer.createDiv({
			cls: "agent-chat-msg agent-chat-msg-assistant agent-chat-thinking",
		});
		const bubble = wrapper.createDiv({ cls: "agent-chat-bubble" });
		const dots = bubble.createDiv({ cls: "agent-chat-dots" });
		dots.createSpan({ cls: "dot" });
		dots.createSpan({ cls: "dot" });
		dots.createSpan({ cls: "dot" });

		this.scrollToBottom();
		return wrapper;
	}

	private scrollToBottom(): void {
		requestAnimationFrame(() => {
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		});
	}
}
