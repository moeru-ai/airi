/**
 * AIRI Core — Filesystem-Backed Workspace Storage
 *
 * Manages workspace directories and manifests on the filesystem.
 * All operations use atomic writes (temp file + rename) for crash safety.
 *
 * Design decisions:
 * - Workspace directories are stored under a configurable base path.
 * - Each workspace has a workspace.json manifest with its descriptor.
 * - Atomic writes prevent corruption on crash.
 * - Per-session directories under workspace root for isolation.
 */

import { promises as fs } from "node:fs"
import path from "node:path"

import type {
	WorkspaceId,
	WorkspaceDescriptor,
} from "./types.js"

// ── Workspace Storage ────────────────────────────────────────────────────

/**
 * Filesystem-backed storage for workspace manifests and directories.
 */
export class WorkspaceStorage {
	private readonly basePath: string

	/**
	 * Create a new WorkspaceStorage.
	 *
	 * @param basePath - Base directory for all workspace data.
	 */
	constructor(basePath: string) {
		this.basePath = basePath
	}

	// ── Path resolution ───────────────────────────────────────────────────

	/**
	 * Resolve a workspace-relative path to an absolute filesystem path.
	 *
	 * @param workspaceId - The workspace ID.
	 * @param segments - Additional path segments.
	 * @returns The absolute filesystem path.
	 */
	resolveWorkspacePath(workspaceId: WorkspaceId, ...segments: string[]): string {
		return path.join(this.basePath, "workspaces", workspaceId as string, ...segments)
	}

	/**
	 * Get the workspace root directory path.
	 */
	private workspaceRoot(workspaceId: WorkspaceId): string {
		return path.join(this.basePath, "workspaces", workspaceId as string)
	}

	// ── Directory management ──────────────────────────────────────────────

	/**
	 * Ensure the workspace root directory exists.
	 *
	 * @returns The absolute path to the workspace root.
	 */
	async ensureWorkspaceRoot(workspaceId: WorkspaceId): Promise<string> {
		const root = this.workspaceRoot(workspaceId)
		await fs.mkdir(root, { recursive: true })
		return root
	}

	/**
	 * Remove the workspace root directory and all its contents.
	 */
	async removeWorkspaceRoot(workspaceId: WorkspaceId): Promise<void> {
		const root = this.workspaceRoot(workspaceId)
		await fs.rm(root, { recursive: true, force: true })
	}

	// ── Manifest operations ───────────────────────────────────────────────

	/**
	 * Write a workspace manifest (workspace.json) atomically.
	 *
	 * Uses temp file + rename for crash safety.
	 */
	async writeManifest(workspaceId: WorkspaceId, descriptor: WorkspaceDescriptor): Promise<void> {
		const root = await this.ensureWorkspaceRoot(workspaceId)
		const manifestPath = path.join(root, "workspace.json")
		const tmpPath = `${manifestPath}.tmp.${process.pid}`

		const content = JSON.stringify(descriptor, null, 2)
		await fs.writeFile(tmpPath, content, "utf-8")

		// fsync for crash safety.
		const fd = await fs.open(tmpPath, "r")
		try {
			await fd.sync()
		} finally {
			await fd.close()
		}

		await fs.rename(tmpPath, manifestPath)
	}

	/**
	 * Read a workspace manifest.
	 *
	 * @returns The descriptor, or null if the manifest doesn't exist.
	 */
	async readManifest(workspaceId: WorkspaceId): Promise<WorkspaceDescriptor | null> {
		const root = this.workspaceRoot(workspaceId)
		const manifestPath = path.join(root, "workspace.json")

		try {
			const content = await fs.readFile(manifestPath, "utf-8")
			return JSON.parse(content) as WorkspaceDescriptor
		} catch (error: unknown) {
			const err = error as Partial<NodeJS.ErrnoException> | undefined
			if (err?.code === "ENOENT") return null
			throw error
		}
	}

	/**
	 * List all workspace manifests.
	 *
	 * @returns Array of descriptors for all workspaces with manifests.
	 */
	async listManifests(): Promise<WorkspaceDescriptor[]> {
		const workspacesDir = path.join(this.basePath, "workspaces")
		const descriptors: WorkspaceDescriptor[] = []

		let entries: import("node:fs").Dirent[]
		try {
			entries = await fs.readdir(workspacesDir, { withFileTypes: true })
		} catch (error: unknown) {
			const err = error as Partial<NodeJS.ErrnoException> | undefined
			if (err?.code === "ENOENT") return []
			throw error
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue

			const manifestPath = path.join(workspacesDir, entry.name, "workspace.json")
			try {
				const content = await fs.readFile(manifestPath, "utf-8")
				descriptors.push(JSON.parse(content) as WorkspaceDescriptor)
			} catch {
				// Skip corrupted or missing manifests.
			}
		}

		return descriptors
	}

	// ── Cleanup ───────────────────────────────────────────────────────────

	/**
	 * Remove orphaned workspace directories.
	 *
	 * Scans the workspaces directory and removes any workspace not in
	 * the active set.
	 *
	 * @param activeWorkspaceIds - Set of active workspace IDs.
	 * @returns The number of orphaned workspaces removed.
	 */
	async cleanupOrphanedWorkspaces(activeWorkspaceIds: Set<string>): Promise<number> {
		const workspacesDir = path.join(this.basePath, "workspaces")

		let entries: import("node:fs").Dirent[]
		try {
			entries = await fs.readdir(workspacesDir, { withFileTypes: true })
		} catch (error: unknown) {
			const err = error as Partial<NodeJS.ErrnoException> | undefined
			if (err?.code === "ENOENT") return 0
			throw error
		}

		let removed = 0
		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			if (activeWorkspaceIds.has(entry.name)) continue

			await fs.rm(path.join(workspacesDir, entry.name), { recursive: true, force: true })
			removed++
		}

		return removed
	}

	// ── Session directories ───────────────────────────────────────────────

	/**
	 * Ensure a session directory exists under a workspace root.
	 *
	 * @returns The absolute path to the session directory.
	 */
	async ensureSessionDir(workspaceId: WorkspaceId, sessionId: string): Promise<string> {
		const sessionDir = this.resolveWorkspacePath(workspaceId, "sessions", sessionId)
		await fs.mkdir(sessionDir, { recursive: true })
		return sessionDir
	}

	/**
	 * Remove a session directory.
	 */
	async removeSessionDir(workspaceId: WorkspaceId, sessionId: string): Promise<void> {
		const sessionDir = this.resolveWorkspacePath(workspaceId, "sessions", sessionId)
		await fs.rm(sessionDir, { recursive: true, force: true })
	}

	// ── Base path ─────────────────────────────────────────────────────────

	/**
	 * Get the base storage path.
	 */
	getBasePath(): string {
		return this.basePath
	}
}
