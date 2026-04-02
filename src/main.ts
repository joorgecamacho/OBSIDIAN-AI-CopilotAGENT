import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, AgentSettingTab } from "./settings";
import { ChatView, CHAT_VIEW_TYPE } from "./ui/ChatView";
import { DiffView, DIFF_VIEW_TYPE } from "./ui/DiffView";
import type { AgentSettings } from "./types";

export default class ObsidianAgent extends Plugin {
	settings: AgentSettings;

	async onload() {
		await this.loadSettings();

		// Register views
		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
		this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf, this));

		// Ribbon icon to open chat
		this.addRibbonIcon("bot", "Open Agent Chat", () => {
			this.activateChatView();
		});

		// Command: Open chat
		this.addCommand({
			id: "open-agent-chat",
			name: "Open Agent Chat",
			callback: () => {
				this.activateChatView();
			},
		});

		// Command: Chat with selection
		this.addCommand({
			id: "chat-with-selection",
			name: "Chat with current selection",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "l" }],
			editorCallback: async (editor, view) => {
				const selection = editor.getSelection();
				if (!selection) return;

				const fromLine = editor.getCursor("from").line + 1;
				const toLine = editor.getCursor("to").line + 1;
				const fileName = view.file?.name || "Untitled";

				const chatView = await this.activateChatView();
				if (chatView) {
					chatView.addReference(fileName, selection, fromLine, toLine);
				}
			},
		});

		// Command: Attach active file (image / PDF) to chat
		this.addCommand({
			id: "attach-active-file",
			name: "Attach active file to chat",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "a" }],
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return;

				const chatView = await this.activateChatView();
				if (chatView) {
					await chatView.addFileAttachment(activeFile);
				}
			},
		});

		// Settings tab
		this.addSettingTab(new AgentSettingTab(this.app, this));
	}

	onunload() {
		// Obsidian handles view cleanup via registerView
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Notify open chat views of settings change
		this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof ChatView) {
				leaf.view.refreshSettings();
			}
		});
	}

	private async activateChatView(): Promise<ChatView | null> {
		const { workspace } = this.app;

		// Check if already open
		const existing = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (existing.length > 0) {
			const leaf = existing[0]!;
			workspace.revealLeaf(leaf);
			return leaf.view as ChatView;
		}

		// Open in right sidebar
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: CHAT_VIEW_TYPE,
				active: true,
			});
			workspace.revealLeaf(leaf);
			return leaf.view as ChatView;
		}
		
		return null;
	}
}
