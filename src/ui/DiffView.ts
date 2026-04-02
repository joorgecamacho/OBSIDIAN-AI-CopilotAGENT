import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type ObsidianAgent from "../main";
import type { PendingChange } from "../types";
import { diffLines } from "diff";

export const DIFF_VIEW_TYPE = "obsidian-agent-diff";

export class DiffView extends ItemView {
	private codeBlock: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private plugin: ObsidianAgent) {
		super(leaf);
	}

	getViewType(): string {
		return DIFF_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Agent Diff";
	}

	getIcon(): string {
		return "file-diff";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("agent-diff-container");

		// Initial state before setState is called
		container.createEl("p", { text: "Waiting for changes...", cls: "agent-diff-waiting" });
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	public setDiffData(pendingChange: PendingChange, onAccept: () => Promise<void>, onReject: () => void) {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		this.codeBlock = container.createDiv({ cls: "agent-chat-code-block diff-view-block" });
			
		// 1. Header
		const header = this.codeBlock.createDiv({ cls: "agent-chat-code-block-header" });
		const headerLeft = header.createDiv({ cls: "agent-chat-code-block-header-filename" });
		setIcon(headerLeft, "file-diff");
		headerLeft.createSpan({ text: pendingChange.path });

		const headerActions = header.createDiv({ cls: "agent-chat-code-block-header-actions" });
		const accButton = headerActions.createEl("button", { text: "✅ Apply", cls: "agent-chat-apply-btn" });
		const rejButton = headerActions.createEl("button", { text: "❌ Reject", cls: "agent-chat-reject-btn" });

		rejButton.addEventListener("click", () => {
			onReject();
			this.leaf.detach(); // Close the tab
		});

		accButton.addEventListener("click", async () => {
			accButton.disabled = true;
			accButton.textContent = "⏳ Applying...";
			rejButton.style.display = "none";
			try {
				await onAccept();
				accButton.textContent = "✅ Applied";
				this.codeBlock.classList.add("agent-chat-code-block-applied");
				
				// Close the tab automatically after a short delay so the user sees success
				setTimeout(() => {
					this.leaf.detach();
				}, 600);
			} catch (err) {
				accButton.disabled = false;
				accButton.textContent = "❌ Failed";
				rejButton.style.display = ""; // Restore reject button
				console.error("Failed to apply change:", err);
			}
		});

		// 2. Diff Content
		const diffContent = this.codeBlock.createDiv({ cls: "agent-chat-diff-content diff-view-content" });

		// Use the 'diff' npm package to create an interleaved diff array
		const modifications = diffLines(pendingChange.oldContent || "", pendingChange.newContent || "");

		let oldLineNum = 1;
		let newLineNum = 1;

		for (const change of modifications) {
			const lines = change.value.split("\n");
			// Remove the empty string caused by the trailing newline
			if (lines[lines.length - 1] === "") {
				lines.pop();
			}

			// Determine exactly what CSS classes to apply for the block
			const lineClass = change.added ? "diff-added" : change.removed ? "diff-removed" : "diff-unchanged";
			const indicatorText = change.added ? "+" : change.removed ? "-" : " ";

			for (const line of lines) {
				const lineEl = diffContent.createDiv({ cls: `diff-line ${lineClass}` });
				
				// Left Gutter (Line Numbers & Indicator)
				const gutter = lineEl.createDiv({ cls: "diff-gutter" });
				
				const oldNumSpan = gutter.createSpan({ cls: "diff-line-number" });
				if (!change.added) {
					oldNumSpan.textContent = String(oldLineNum++);
				}

				const newNumSpan = gutter.createSpan({ cls: "diff-line-number" });
				if (!change.removed) {
					newNumSpan.textContent = String(newLineNum++);
				}

				// The +/- indicator sits inside the gutter right before the text
				gutter.createSpan({ text: indicatorText, cls: "diff-indicator" });

				// Code Content
				lineEl.createSpan({ text: line || " ", cls: "diff-text" });
			}
		}
	}
}
