import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { ToolDefinition, ToolResult, PendingChange } from "../types";
import { PDFParse } from "pdf-parse";

/**
 * Vault tools — file & folder operations available to the agent.
 */
export class VaultTools {
	constructor(private app: App) { }

	/** Tool definitions to send to the LLM. */
	static getDefinitions(): ToolDefinition[] {
		return [
			{
				type: "function",
				function: {
					name: "create_file",
					description: "Create a new file in the vault with the given content. If the file already exists it will be overwritten.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "Path relative to the vault root (e.g. 'Notes/my-note.md')." },
							content: { type: "string", description: "Markdown content to write." },
						},
						required: ["path", "content"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "read_file",
					description: "Read the full contents of a file in the vault.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "Path relative to the vault root." },
						},
						required: ["path"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "write_file",
					description: "Write content to an existing file. Use mode 'overwrite' to replace or 'append' to add at the end.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "Path relative to the vault root." },
							content: { type: "string", description: "Content to write." },
							mode: { type: "string", enum: ["overwrite", "append"], description: "Write mode. Default: overwrite." },
						},
						required: ["path", "content"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "delete_file",
					description: "Delete a file from the vault (moves to system trash).",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "Path relative to the vault root." },
						},
						required: ["path"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "rename_file",
					description: "Rename or move a file within the vault.",
					parameters: {
						type: "object",
						properties: {
							oldPath: { type: "string", description: "Current path of the file." },
							newPath: { type: "string", description: "New path for the file." },
						},
						required: ["oldPath", "newPath"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "list_files",
					description: "List all files and folders inside a directory. Use '/' or '' for vault root.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "Folder path relative to the vault root. Use '' for root." },
						},
						required: ["path"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "search_vault",
					description: "Search for files whose content or filename matches a query string (case-insensitive).",
					parameters: {
						type: "object",
						properties: {
							query: { type: "string", description: "Search query." },
						},
						required: ["query"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "get_active_file",
					description: "Get the path and content of the currently active (open) file in Obsidian.",
					parameters: {
						type: "object",
						properties: {},
						required: [],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "create_folder",
					description: "Create a new folder in the vault.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "Folder path relative to vault root." },
						},
						required: ["path"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "read_pdf",
					description: "Extract the text content from a PDF file in the vault. Returns the full plain text.",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "Path to the PDF file relative to the vault root (e.g. 'Attachments/lecture.pdf')." },
						},
						required: ["path"],
					},
				},
			},
		];
	}

	/** Execute a tool by name with JSON-parsed arguments. */
	async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
		try {
			switch (name) {
				case "create_file":
					return await this.createFile(args["path"] as string, args["content"] as string);
				case "read_file":
					return await this.readFile(args["path"] as string);
				case "write_file":
					return await this.writeFile(args["path"] as string, args["content"] as string, (args["mode"] as string) || "overwrite");
				case "delete_file":
					return await this.deleteFile(args["path"] as string);
				case "rename_file":
					return await this.renameFile(args["oldPath"] as string, args["newPath"] as string);
				case "list_files":
					return await this.listFiles(args["path"] as string);
				case "search_vault":
					return await this.searchVault(args["query"] as string);
				case "get_active_file":
					return this.getActiveFile();
				case "create_folder":
					return await this.createFolder(args["path"] as string);
				case "read_pdf":
					return await this.readPdf(args["path"] as string);
				default:
					return { success: false, result: `Unknown tool: ${name}` };
			}
		} catch (err) {
			return { success: false, result: `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}` };
		}
	}

	// ── Implementations ───────────────────────────────────────

	private async createFile(path: string, content: string): Promise<ToolResult> {
		const normalized = normalizePath(path);
		// Ensure parent folders exist
		const folder = normalized.substring(0, normalized.lastIndexOf("/"));
		if (folder) {
			await this.ensureFolder(folder);
		}
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFile) {
			const oldContent = await this.app.vault.read(existing);
			return { success: true, result: `File '${normalized}' pending for user approval.`, pendingChange: { path: normalized, oldContent: oldContent, newContent: content } };
		}

		return { success: true, result: `File '${normalized}' pending for user approval.`, pendingChange: { path: normalized, oldContent: null, newContent: content } };
	}

	private async readFile(path: string): Promise<ToolResult> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) {
			return { success: false, result: `File not found: ${normalized}` };
		}
		const content = await this.app.vault.read(file);
		return { success: true, result: content };
	}

	private async writeFile(path: string, content: string, mode: string): Promise<ToolResult> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) {
			return { success: false, result: `File not found: ${normalized}. Use create_file instead.` };
		}
		const existing = await this.app.vault.read(file);
		if (mode === "append") {
			return { success: true, result: `File '${normalized}' ${mode === "append" ? "appended" : "overwritten"}.`, pendingChange: { path: normalized, oldContent: existing, newContent: existing + "\n" + content } };

		} else {
			return { success: true, result: `File '${normalized}' ${mode === "append" ? "appended" : "overwritten"}.`, pendingChange: { path: normalized, oldContent: existing, newContent: content } };
		}
	}

	private async deleteFile(path: string): Promise<ToolResult> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!file) {
			return { success: false, result: `File not found: ${normalized}` };
		}
		await this.app.vault.trash(file, true);
		return { success: true, result: `File '${normalized}' moved to trash.` };
	}

	private async renameFile(oldPath: string, newPath: string): Promise<ToolResult> {
		const normOld = normalizePath(oldPath);
		const normNew = normalizePath(newPath);
		const file = this.app.vault.getAbstractFileByPath(normOld);
		if (!file) {
			return { success: false, result: `File not found: ${normOld}` };
		}
		// Ensure destination folder exists
		const folder = normNew.substring(0, normNew.lastIndexOf("/"));
		if (folder) {
			await this.ensureFolder(folder);
		}
		await this.app.fileManager.renameFile(file, normNew);
		return { success: true, result: `Renamed '${normOld}' → '${normNew}'.` };
	}

	public async applyPendingChange(path: string, pendingChange: PendingChange): Promise<ToolResult> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!file) {
			await this.app.vault.create(normalized, pendingChange.newContent);
		} else if (file instanceof TFile) {
			await this.app.vault.modify(file, pendingChange.newContent);
		} else {
			return { success: false, result: `Cannot modify ${normalized} as it is not a file.` };
		}
		return { success: true, result: `Changes Applied` };
	}

	private async listFiles(path: string): Promise<ToolResult> {
		const normalized = path ? normalizePath(path) : "";
		let folder: TFolder;

		if (!normalized || normalized === "/") {
			folder = this.app.vault.getRoot();
		} else {
			const f = this.app.vault.getAbstractFileByPath(normalized);
			if (!(f instanceof TFolder)) {
				return { success: false, result: `Folder not found: ${normalized}` };
			}
			folder = f;
		}

		const items = folder.children.map((child) => {
			const isFolder = child instanceof TFolder;
			return `${isFolder ? "📁" : "📄"} ${child.name}`;
		});

		if (items.length === 0) {
			return { success: true, result: "Folder is empty." };
		}
		return { success: true, result: items.join("\n") };
	}

	private async searchVault(query: string): Promise<ToolResult> {
		const lowerQuery = query.toLowerCase();
		const allFiles = this.app.vault.getMarkdownFiles();
		const matches: string[] = [];

		for (const file of allFiles) {
			if (matches.length >= 20) break; // limit results

			if (file.path.toLowerCase().includes(lowerQuery)) {
				matches.push(`📄 ${file.path} (filename match)`);
				continue;
			}
			try {
				const content = await this.app.vault.cachedRead(file);
				if (content.toLowerCase().includes(lowerQuery)) {
					// Find the matching line for context
					const lines = content.split("\n");
					const matchLine = lines.find((l) => l.toLowerCase().includes(lowerQuery));
					const preview = matchLine ? matchLine.trim().substring(0, 100) : "";
					matches.push(`📄 ${file.path} — "${preview}"`);
				}
			} catch {
				// Skip unreadable files
			}
		}

		if (matches.length === 0) {
			return { success: true, result: `No files found matching "${query}".` };
		}
		return { success: true, result: `Found ${matches.length} result(s):\n${matches.join("\n")}` };
	}

	private getActiveFile(): ToolResult {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			return { success: false, result: "No file is currently active." };
		}
		return { success: true, result: `Active file: ${file.path}` };
	}

	private async createFolder(path: string): Promise<ToolResult> {
		const normalized = normalizePath(path);
		await this.ensureFolder(normalized);
		return { success: true, result: `Folder '${normalized}' created (or already exists).` };
	}

	private async readPdf(path: string): Promise<ToolResult> {
		const normalized = normalizePath(path);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) {
			return { success: false, result: `PDF file not found: ${normalized}` };
		}
		if (file.extension.toLowerCase() !== "pdf") {
			return { success: false, result: `File '${normalized}' is not a PDF.` };
		}
		try {
			const buffer = await this.app.vault.readBinary(file);
			PDFParse.setWorker("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs");
			const parser = new PDFParse({ data: new Uint8Array(buffer) });
			const result = await parser.getText();
			await parser.destroy();
			const text = result.text.trim();
			if (!text) {
				return { success: true, result: `PDF '${normalized}' contains no extractable text (may be scanned/image-only).` };
			}
			// Truncate very large PDFs to avoid blowing up the context window
			const MAX_CHARS = 30000;
			const truncated = text.length > MAX_CHARS
				? text.substring(0, MAX_CHARS) + `\n\n[... truncated, ${text.length - MAX_CHARS} characters omitted ...]`
				: text;
			return { success: true, result: truncated };
		} catch (err) {
			return { success: false, result: `Failed to parse PDF '${normalized}': ${err instanceof Error ? err.message : String(err)}` };
		}
	}

	/** Recursively create folders if they don't exist. */
	private async ensureFolder(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFolder) return;
		await this.app.vault.createFolder(normalized);
	}
}
