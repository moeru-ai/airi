/**
 * AIRI Core — Filesystem Persistence Adapter
 *
 * Implements PersistenceAdapter using Node.js fs/promises.
 *
 * Design decisions:
 * - Atomic writes: write to temp file then rename.
 * - Crash safety: fs.fsync after critical writes.
 * - Deterministic serialization: JSON.stringify with sorted keys.
 * - Append operations use file append mode.
 */

import { promises as fs } from "node:fs"
import path from "node:path"

import type { PersistenceAdapter, PersistenceTransaction } from "../../types.js"

/**
 * Filesystem-based persistence adapter.
 *
 * All data is stored under a base directory. Keys are mapped to file paths
 * by replacing ":" with path separators for directory structure.
 *
 * Key format: "prefix:name" → basePath/prefix/name
 * This creates a natural directory hierarchy.
 */
export class FilesystemPersistenceAdapter implements PersistenceAdapter {
	private readonly basePath: string

	constructor(basePath: string) {
		this.basePath = basePath
	}

	// ── Lifecycle ────────────────────────────────────────────────────────

	/**
	 * Initialize the adapter — ensure the base directory exists.
	 */
	async initialize(): Promise<void> {
		await fs.mkdir(this.basePath, { recursive: true })
	}

	// ── PersistenceAdapter interface ─────────────────────────────────────

	async read(key: string): Promise<Buffer | null> {
		const filePath = this.keyToPath(key)
		try {
			return await fs.readFile(filePath)
		} catch (error: NodeJS.ErrnoException) {
			if (error?.code === "ENOENT") return null
			throw error
		}
	}

	async write(key: string, data: Buffer): Promise<void> {
		const filePath = this.keyToPath(key)
		const dir = path.dirname(filePath)

		// Ensure the directory exists.
		await fs.mkdir(dir, { recursive: true })

		// Atomic write: write to temp file then rename.
		const tmpPath = `${filePath}.tmp.${process.pid}`
		await fs.writeFile(tmpPath, data)

		// fsync for crash safety.
		const fd = await fs.open(tmpPath, "r")
		try {
			await fd.sync()
		} finally {
			await fd.close()
		}

		await fs.rename(tmpPath, filePath)
	}

	async append(key: string, data: Buffer): Promise<void> {
		const filePath = this.keyToPath(key)
		const dir = path.dirname(filePath)

		// Ensure the directory exists.
		await fs.mkdir(dir, { recursive: true })

		// Append to the file.
		await fs.appendFile(filePath, data)
	}

	async delete(key: string): Promise<void> {
		const filePath = this.keyToPath(key)
		try {
			// Check if it's a directory and remove recursively.
			const stat = await fs.stat(filePath)
			if (stat.isDirectory()) {
				await fs.rm(filePath, { recursive: true, force: true })
			} else {
				await fs.unlink(filePath)
			}
		} catch (error: NodeJS.ErrnoException) {
			if (error?.code === "ENOENT") return
			throw error
		}
	}

	async list(prefix: string): Promise<string[]> {
		const { searchDir, prefixFilter } = await this.findDeepestExistingDir(prefix)
		const keys = await this.listRecursive(searchDir, "")
		const fullPrefix = prefixFilter ? `${prefix}${prefixFilter}` : prefix
		return keys
			.filter((key) => key.startsWith(prefix) || key.startsWith(fullPrefix))
			.sort()
	}

	/**
	 * Walk up from the prefix path to find the deepest existing directory.
	 */
	private async findDeepestExistingDir(prefix: string): Promise<{
		searchDir: string
		prefixFilter: string
	}> {
		const prefixPath = this.keyToPath(prefix)
		let searchDir = prefixPath
		let prefixFilter = ""

		while (searchDir !== this.basePath && searchDir !== path.dirname(searchDir)) {
			const stat = await fs.stat(searchDir).catch(() => null)
			if (stat?.isDirectory()) {
				break
			}

			const basename = path.basename(searchDir)
			prefixFilter = prefixFilter ? `${basename}:${prefixFilter}` : basename
			searchDir = path.dirname(searchDir)
		}

		return { searchDir, prefixFilter }
	}

	async exists(key: string): Promise<boolean> {
		const filePath = this.keyToPath(key)
		try {
			await fs.access(filePath)
			return true
		} catch {
			return false
		}
	}

	// ── Transaction ──────────────────────────────────────────────────────

	/**
	 * Create a new transaction for batch operations.
	 */
	transaction(): FilesystemTransaction {
		return new FilesystemTransaction(this)
	}

	// ── Private ──────────────────────────────────────────────────────────

	/**
	 * Recursively list all files under a directory and convert them back to keys.
	 */
	private async listRecursive(dirPath: string, _prefix: string): Promise<string[]> {
		const entries = await this.readDirSafe(dirPath)
		if (!entries) return []

		const keys: string[] = []
		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name)
			if (entry.isDirectory()) {
				const subKeys = await this.listRecursive(fullPath, _prefix)
				keys.push(...subKeys)
			} else if (!this.shouldSkipEntry(entry.name)) {
				keys.push(this.pathToKey(fullPath))
			}
		}

		return keys
	}

	private async readDirSafe(dirPath: string): Promise<import("node:fs").Dirent[] | null> {
		try {
			return await fs.readdir(dirPath, { withFileTypes: true })
		} catch (error: NodeJS.ErrnoException) {
			if (error?.code === "ENOENT") return null
			throw error
		}
	}

	private shouldSkipEntry(name: string): boolean {
		return name.endsWith(`.tmp.${process.pid}`)
	}

	/**
	 * Convert a key to a filesystem path.
	 *
	 * Keys use ":" as a separator (e.g. "events:log").
	 * These are mapped to directory/file paths.
	 */
	private keyToPath(key: string): string {
		// Replace ":" with path separator for directory structure.
		const parts = key.split(":")
		return path.join(this.basePath, ...parts)
	}

	/**
	 * Convert a filesystem path back to a key.
	 */
	private pathToKey(filePath: string): string {
		const relative = path.relative(this.basePath, filePath)
		return relative.split(path.sep).join(":")
	}
}

/**
 * Filesystem-based transaction for batch operations.
 *
 * Collects operations and executes them sequentially on commit.
 * Rollback simply discards the queued operations.
 */
export class FilesystemTransaction implements PersistenceTransaction {
	private readonly adapter: FilesystemPersistenceAdapter
	private readonly operations: Array<{
		type: "write" | "append" | "delete"
		key: string
		data?: Buffer
	}> = []

	constructor(adapter: FilesystemPersistenceAdapter) {
		this.adapter = adapter
	}

	write(key: string, data: Buffer): void {
		this.operations.push({ type: "write", key, data })
	}

	append(key: string, data: Buffer): void {
		this.operations.push({ type: "append", key, data })
	}

	delete(key: string): void {
		this.operations.push({ type: "delete", key })
	}

	async commit(): Promise<void> {
		for (const op of this.operations) {
			switch (op.type) {
				case "write":
					await this.adapter.write(op.key, op.data!)
					break
				case "append":
					await this.adapter.append(op.key, op.data!)
					break
				case "delete":
					await this.adapter.delete(op.key)
					break
				default:
					break
			}
		}
		this.operations.length = 0
	}

	rollback(): Promise<void> {
		this.operations.length = 0
		return Promise.resolve()
	}
}
