import { App, PluginSettingTab, Setting, requestUrl, SuggestModal, Notice } from "obsidian";
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

class ModelSuggestModal extends SuggestModal<string> {
	models: string[] = [];
	onChoose: (model: string) => void;

	constructor(app: App, models: string[], onChoose: (model: string) => void) {
		super(app);
		this.models = models;
		this.onChoose = onChoose;
		this.setPlaceholder("Search for a model...");
	}

	getSuggestions(query: string): string[] {
		return this.models.filter((m) => m.toLowerCase().includes(query.toLowerCase()));
	}

	renderSuggestion(model: string, el: HTMLElement) {
		el.createEl("div", { text: model });
	}

	onChooseSuggestion(model: string, evt: MouseEvent | KeyboardEvent) {
		this.onChoose(model);
	}
}

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

		let textEl: HTMLInputElement;

		modelSetting.addText((text) => {
			text.setPlaceholder("e.g. llama3, mistral");
			text.setValue(this.plugin.settings.ollamaModel);
			text.onChange(async (value) => {
				this.plugin.settings.ollamaModel = value;
				await this.plugin.saveSettings();
			});
			textEl = text.inputEl;
		});

		modelSetting.addButton((btn) => {
			btn.setButtonText("Search");
			btn.onClick(async () => {
				btn.setButtonText("Loading...");
				await this.searchOllamaModels(textEl);
				btn.setButtonText("Search");
			});
		});
	}

	private async searchOllamaModels(textElement: HTMLInputElement): Promise<void> {
		try {
			const baseUrl = this.plugin.settings.ollamaBaseUrl.replace(/\/+$/, "");
			const allModels = new Set<string>();

			try {
				const res1 = await requestUrl({ url: `${baseUrl}/api/tags` });
				const data1 = res1.json as { models?: { name: string }[] };
				if (data1.models) {
					data1.models.forEach((m) => { if (m.name) allModels.add(m.name); });
				}
			} catch {}

			try {
				const res2 = await requestUrl({ url: `${baseUrl}/v1/models` });
				const data2 = res2.json as { data?: { id: string }[] };
				if (data2.data) {
					data2.data.forEach((m) => { if (m.id) allModels.add(m.id); });
				}
			} catch {}

			const modelArray = Array.from(allModels);
			if (modelArray.length > 0) {
				new ModelSuggestModal(this.app, modelArray, async (selected) => {
					this.plugin.settings.ollamaModel = selected;
					await this.plugin.saveSettings();
					textElement.value = selected;
				}).open();
			} else {
				new Notice("No models found. Check if the server is running.");
			}
		} catch (e) {
			console.log("Could not connect to Ollama to fetch local models.", e);
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

		const modelSetting = new Setting(containerEl)
			.setName("Model")
			.setDesc("Model identifier (e.g. gpt-4o, claude-3-5-sonnet).");

		let textEl: HTMLInputElement;

		modelSetting.addText((text) => {
			text.setPlaceholder("gpt-4o");
			text.setValue(this.plugin.settings.customModel);
			text.onChange(async (value) => {
				this.plugin.settings.customModel = value;
				await this.plugin.saveSettings();
			});
			textEl = text.inputEl;
		});

		modelSetting.addButton((btn) => {
			btn.setButtonText("Search");
			btn.onClick(async () => {
				btn.setButtonText("Loading...");
				await this.searchCustomModels(textEl);
				btn.setButtonText("Search");
			});
		});
	}

	private async searchCustomModels(textElement: HTMLInputElement): Promise<void> {
		if (!this.plugin.settings.customBaseUrl) {
			new Notice("Please set the API base URL first.");
			return;
		}
		try {
			const baseUrl = this.plugin.settings.customBaseUrl.replace(/\/+$/, "");
			const headers: Record<string, string> = {};
			if (this.plugin.settings.customApiKey) {
				headers["Authorization"] = `Bearer ${this.plugin.settings.customApiKey}`;
			}
			const response = await requestUrl({ 
				url: `${baseUrl}/models`,
				headers
			});
			const data = response.json as { data?: { id: string }[] };

			if (data.data && data.data.length > 0) {
				const models = data.data.map(m => m.id).filter(Boolean);
				new ModelSuggestModal(this.app, models, async (selected) => {
					this.plugin.settings.customModel = selected;
					await this.plugin.saveSettings();
					textElement.value = selected;
				}).open();
			} else {
				new Notice("No models found from this custom API.");
			}
		} catch {
			new Notice("Could not fetch remote models. Please check your URL and API key.");
		}
	}
}
