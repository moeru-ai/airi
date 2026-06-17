/**
 * AIRI Core — Git Worktree Integration
 *
 * Manages isolated git worktrees for workspace execution. Each workspace
 * can optionally have its own worktree, ensuring that execution never
 * mutates the primary repository directly.
 *
 * Design decisions:
 * - Worktrees are created from a specified branch or as detached HEAD.
 * - All git operations target worktrees, never the primary repo.
 * - Orphaned worktree detection via workspace manifest reconciliation.
 * - Cleanup on workspace destruction.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import type { WorkspaceId } from "./types.js"

const execFileAsync = promisify(execFile)

// ── Worktree record ─────────────────────────────────────────────────────

/**
 * A git worktree record.
 */
export interface WorktreeRecord {
	/** Absolute path to the worktree directory. */
	readonly path: string

	/** Git branch name. */
	readonly branch: string

	/** Associated workspace ID, if known. */
	readonly workspaceId?: string
}

// ── Workspace Worktree ──────────────────────────────────────────────────

/**
 * Manages git worktrees for workspace isolation.
 */
export class WorkspaceWorktree {
	private readonly repositoryPath: string

	/**
	 * Create a new WorkspaceWorktree manager.
	 *
	 * @param repositoryPath - Absolute path to the primary git repository.
	 */
	constructor(repositoryPath: string) {
		this.repositoryPath = repositoryPath
	}

	// ── Create / Remove ───────────────────────────────────────────────────

	/**
	 * Create an isolated git worktree for a workspace.
	 *
	 * @param workspaceId - The workspace ID.
	 * @param branchName - Optional branch name. If omitted, creates a detached HEAD worktree.
	 * @returns The absolute path to the created worktree.
	 */
	async createWorktree(
		workspaceId: WorkspaceId,
		branchName?: string,
	): Promise<string> {
		const worktreePath = this.resolveWorktreePath(workspaceId)

		const args = ["worktree", "add"]

		if (branchName) {
			// Create a new branch based on the specified branch.
			args.push("-b", `airi/${workspaceId as string}/${branchName}`)
			args.push(worktreePath)
			args.push(branchName)
		} else {
			// Detached HEAD worktree.
			const hash = await this.getHeadCommit()
			args.push(worktreePath)
			args.push(hash)
		}

		await execFileAsync("git", args, { cwd: this.repositoryPath })

		return worktreePath
	}

	/**
	 * Remove a git worktree.
	 *
	 * @param worktreePath - Absolute path to the worktree to remove.
	 */
	async removeWorktree(worktreePath: string): Promise<void> {
		try {
			await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
				cwd: this.repositoryPath,
			})
		} catch (error: unknown) {
			// If git remove fails, try manual cleanup.
			const err = error as Partial<NodeJS.ErrnoException> & { stderr?: string } | undefined
			if (err?.code === "ENOENT" || err?.stderr?.includes("not a worktree")) {
				await fs.rm(worktreePath, { recursive: true, force: true })
			} else {
				throw error
			}
		}
	}

	// ── Query ─────────────────────────────────────────────────────────────

	/**
	 * Get the worktree path for a workspace.
	 *
	 * @returns The worktree path, or undefined if not found.
	 */
	getWorktreePath(workspaceId: WorkspaceId): string | undefined {
		const worktreePath = this.resolveWorktreePath(workspaceId)
		// Check if the directory exists.
		return fs.access(worktreePath).then(() => worktreePath).catch(() => undefined)
	}

	/**
	 * List all git worktrees for the repository.
	 *
	 * @returns Array of worktree records.
	 */
	async listWorktrees(): Promise<WorktreeRecord[]> {
		try {
			const { stdout } = await execFileAsync(
				"git",
				["worktree", "list", "--porcelain"],
				{ cwd: this.repositoryPath },
			)

			return this.parseWorktreeList(stdout)
		} catch {
			return []
		}
	}

	/**
	 * List orphaned worktrees — worktrees whose directories no longer exist.
	 */
	async listOrphanedWorktrees(): Promise<string[]> {
		const { stdout } = await execFileAsync(
			"git",
			["worktree", "list", "--porcelain"],
			{ cwd: this.repositoryPath },
		)

		const orphaned: string[] = []
		const lines = stdout.split("\n")
		let currentPath: string | undefined

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				currentPath = line.slice("worktree ".length).trim()
			} else if (line === "" && currentPath) {
				// Check if the worktree directory still exists.
				try {
					await fs.access(currentPath)
				} catch {
					orphaned.push(currentPath)
				}
				currentPath = undefined
			}
		}

		return orphaned
	}

	// ── Validation ────────────────────────────────────────────────────────

	/**
	 * Validate that a worktree path is a valid git worktree.
	 */
	static async validateWorktree(worktreePath: string): Promise<boolean> {
		try {
			// Check if the directory exists.
			await fs.access(worktreePath)

			// Check if it has a .git file (worktree marker).
			const gitFilePath = path.join(worktreePath, ".git")
			const stat = await fs.stat(gitFilePath)
			return stat.isFile()
		} catch {
			return false
		}
	}

	/**
	 * Get the branch name for a worktree.
	 */
	async getWorktreeBranch(worktreePath: string): Promise<string> {
		const { stdout } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ cwd: worktreePath },
		)
		return stdout.trim()
	}

	// ── Cleanup ───────────────────────────────────────────────────────────

	/**
	 * Clean up orphaned worktrees.
	 *
	 * @param activeWorkspaceIds - Set of active workspace IDs.
	 * @returns The number of orphaned worktrees removed.
	 */
	async cleanupOrphanedWorktrees(activeWorkspaceIds: Set<string>): Promise<number> {
		const worktrees = await this.listWorktrees()
		let removed = 0

		for (const wt of worktrees) {
			// Skip the primary repository entry.
			if (wt.path === this.repositoryPath) continue

			// Check if this worktree belongs to an active workspace.
			if (wt.workspaceId && activeWorkspaceIds.has(wt.workspaceId)) continue

			// Check if the directory still exists.
			try {
				await fs.access(wt.path)
			} catch {
				// Directory doesn't exist — orphaned.
				await this.removeWorktree(wt.path)
				removed++
			}
		}

		return removed
	}

	// ── Private helpers ───────────────────────────────────────────────────

	/**
	 * Resolve the worktree path for a workspace.
	 */
	private resolveWorktreePath(workspaceId: WorkspaceId): string {
		return path.join(
			this.repositoryPath,
			".airi-worktrees",
			workspaceId as string,
		)
	}

	/**
	 * Get the current HEAD commit hash.
	 */
	private async getHeadCommit(): Promise<string> {
		const { stdout } = await execFileAsync(
			"git",
			["rev-parse", "HEAD"],
			{ cwd: this.repositoryPath },
		)
		return stdout.trim()
	}

	/**
	 * Parse the output of `git worktree list --porcelain`.
	 */
	private parseWorktreeList(stdout: string): WorktreeRecord[] {
		const records: WorktreeRecord[] = []
		const lines = stdout.split("\n")

		let currentPath: string | undefined
		let currentBranch: string | undefined

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				currentPath = line.slice("worktree ".length).trim()
			} else if (line.startsWith("branch ")) {
				currentBranch = line.slice("branch ".length).trim()
				// Extract branch name from refs/heads/...
				if (currentBranch.startsWith("refs/heads/")) {
					currentBranch = currentBranch.slice("refs/heads/".length)
				}
			} else if (line === "" && currentPath) {
				records.push({
					path: currentPath,
					branch: currentBranch ?? "DETACHED",
				})
				currentPath = undefined
				currentBranch = undefined
			}
		}

		// Handle last entry if file doesn't end with newline.
		if (currentPath) {
			records.push({
				path: currentPath,
				branch: currentBranch ?? "DETACHED",
			})
		}

		return records
	}
}
