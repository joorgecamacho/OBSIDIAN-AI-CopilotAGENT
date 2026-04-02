import { App, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type ObsidianAgent from "./main";
import type { AgentSettings } from "./types";

export const DEFAULT_SETTINGS: AgentSettings = {
	provider: "ollama",
	ollamaBaseUrl: "http://localhost:11434",
	ollamaModel: "",
	customBaseUrl: "",
	customApiKey: "",
	customModel: "",
	systemPrompt:
		"You are a helpful AI assistant embedded in Obsidian. " +
		"You can help the user manage their vault by creating, reading, writing, and searching files. " +
		"When the user asks you to perform an action on their vault, use the available tools. " +
		"Always confirm what you did after performing an action. " +
		"Respond in the same language the user writes to you.",
};

export class AgentSettingTab extends PluginSettingTab {
	plugin: ObsidianAgent;

	constructor(app: App, plugin: ObsidianAgent) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Provider selector ─────────────────────────────────
		containerEl.createEl("h2", { text: "LLM Provider" });

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Choose which LLM backend to use.")
			.addDropdown((dd) =>
				dd
					.addOption("ollama", "Ollama (local)")
					.addOption("custom", "Custom OpenAI-compatible API")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider = value as "ollama" | "custom";
						await this.plugin.saveSettings();
						this.display(); // re-render
					})
			);

		if (this.plugin.settings.provider === "ollama") {
			this.renderOllamaSettings(containerEl);
		} else {
			this.renderCustomSettings(containerEl);
		}

		// ── System prompt ─────────────────────────────────────
		containerEl.createEl("h2", { text: "Agent" });

		new Setting(containerEl)
			.setName("System prompt")
			.setDesc("Instructions given to the AI at the start of every conversation.")
			.addTextArea((ta) =>
				ta
					.setPlaceholder("You are a helpful assistant…")
					.setValue(this.plugin.settings.systemPrompt)
					.onChange(async (value) => {
						this.plugin.settings.systemPrompt = value;
						await this.plugin.saveSettings();
					})
			);

		// Make the textarea bigger
		const textAreas = containerEl.querySelectorAll("textarea");
		const lastTextarea = textAreas[textAreas.length - 1];
		if (lastTextarea) {
			lastTextarea.style.width = "100%";
			lastTextarea.style.minHeight = "120px";
		}
	}

	// ── Ollama settings ───────────────────────────────────────
	private renderOllamaSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Ollama base URL")
			.setDesc("The URL where Ollama is running.")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:11434")
					.setValue(this.plugin.settings.ollamaBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.ollamaBaseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		const modelSetting = new Setting(containerEl)
			.setName("Model")
			.setDesc("Select an Ollama model or type a custom name.");

		modelSetting.addDropdown((dd) => {
			dd.addOption("", "Loading models…");
			dd.setValue(this.plugin.settings.ollamaModel);
			dd.onChange(async (value) => {
				this.plugin.settings.ollamaModel = value;
				await this.plugin.saveSettings();
			});
			// Fetch models async
			this.fetchOllamaModels(dd);
		});
	}

	private async fetchOllamaModels(dropdown: import("obsidian").DropdownComponent): Promise<void> {
		try {
			const baseUrl = this.plugin.settings.ollamaBaseUrl.replace(/\/+$/, "");
			const response = await requestUrl({ url: `${baseUrl}/api/tags` });
			const data = response.json as { models?: { name: string }[] };

			// Clear and re-populate
			dropdown.selectEl.empty();

			if (data.models && data.models.length > 0) {
				for (const model of data.models) {
					dropdown.addOption(model.name, model.name);
				}
				// Set saved value or first model
				const saved = this.plugin.settings.ollamaModel;
				if (saved && data.models.some((m) => m.name === saved)) {
					dropdown.setValue(saved);
				} else {
					dropdown.setValue(data.models[0]?.name ?? "");
					this.plugin.settings.ollamaModel = data.models[0]?.name ?? "";
					await this.plugin.saveSettings();
				}
			} else {
				dropdown.addOption("", "No models found");
			}
		} catch {
			dropdown.selectEl.empty();
			dropdown.addOption("", "Could not connect to Ollama");
		}
	}

	// ── Custom API settings ───────────────────────────────────
	private renderCustomSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("API base URL")
			.setDesc("OpenAI-compatible API endpoint (e.g. https://api.openai.com/v1).")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.customBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.customBaseUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API key")
			.setDesc("Your API key (stored locally).")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("sk-…")
					.setValue(this.plugin.settings.customApiKey)
					.onChange(async (value) => {
						this.plugin.settings.customApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Model identifier (e.g. gpt-4o, claude-3-5-sonnet).")
			.addText((text) =>
				text
					.setPlaceholder("gpt-4o")
					.setValue(this.plugin.settings.customModel)
					.onChange(async (value) => {
						this.plugin.settings.customModel = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
