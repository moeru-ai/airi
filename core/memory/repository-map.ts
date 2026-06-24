/**
 * AIRI Core — Repository Intelligence
 *
 * Scans and indexes repository structure, building a deterministic
 * structural map for intelligence queries.
 *
 * Design decisions:
 * - Filesystem-based: reads actual files, no external services.
 * - Multi-language import parsing: supports common patterns.
 * - Git metadata via simple command execution.
 * - Skips common non-source directories.
 */

import type {
	RepositoryMap,
	RepositoryMapId,
	ArchitectureNode,
	FileGraphNode,
	ImportEdge,
	GitMetadata,
} from "./types.js"
import { createRepositoryMapId } from "./types.js"

// ── Constants ─────────────────────────────────────────────────────────────


/**
 * File extensions to parse for imports.
 */
const PARSEABLE_EXTENSIONS = new Set([
	'.ts',
	'.js',
	'.tsx',
	'.jsx',
	'.py',
	'.rs',
	'.go',
	'.java',
	'.kt',
	'.swift',
	'.m',
	'.mm',
	'.c',
	'.cpp',
	'.h',
	'.hpp',
	'.cs',
	'.rb',
	'.php',
	'.scala',
	'.vue',
	'.svelte',
])

/**
 * Test file patterns.
 */
const TEST_PATTERNS = [
	/\.test\.(ts|js|tsx|jsx|py|rs|go|java|kt|swift)$/,
	/\.spec\.(ts|js|tsx|jsx)$/,
	/__tests__\//,
	/__spec__\//,
	/\/tests?\//,
	/\/spec\//,
]

/**
 * Config file patterns.
 */
const CONFIG_PATTERNS = [
	/tsconfig\.json$/,
	/package\.json$/,
	/\.eslintrc/,
	/\.prettierrc/,
	/vite\.config\./,
	/webpack\.config\./,
	/rollup\.config\./,
	/turbo\.json$/,
	/\.env/,
	/Dockerfile$/,
	/docker-compose/,
	/Makefile$/,
	/Cargo\.toml$/,
	/go\.mod$/,
	/\.gitignore$/,
]

// ── Import parsers ────────────────────────────────────────────────────────

/** Collect all regex matches into an array. */
function collectMatches(content: string, regex: RegExp): string[] {
	const matches: string[] = []
	let m: RegExpExecArray | null
	while ((m = regex.exec(content)) !== null) {
		matches.push(m[1]!)
	}
	return matches
}

/** Parse ES module, CommonJS, and dynamic imports from JS/TS content. */
function parseJsTsImports(content: string): string[] {
	const imports = [
		...collectMatches(content, /import\s+(?:.+\s+from\s+)?['"]([^'"]+)['"]/g),
		...collectMatches(content, /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
		...collectMatches(content, /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
	]
	return imports
}

/** Parse Python imports (`import X` / `from X import Y`). */
function parsePythonImports(content: string): string[] {
	const imports = [
		...collectMatches(content, /^import\s+(\S+)/gm),
		...collectMatches(content, /^from\s+(\S+)\s+import/gm),
	]
	return imports.map((imp) => imp.replace(/\./g, '/'))
}

/** Parse Rust imports (`use crate::X` / `mod X`). */
function parseRustImports(content: string): string[] {
	const imports = [
		...collectMatches(content, /use\s+(?:::)?(\S+)/g),
		...collectMatches(content, /^mod\s+(\S+);/gm),
	]
	return imports.map((imp) => imp.replace(/::/g, '/'))
}

/** Parse Go imports (single-line and multi-line). */
function parseGoImports(content: string): string[] {
	const imports = [
		...collectMatches(content, /import\s+"([^"]+)"/g),
	]

	// Multi-line import blocks.
	const blocks = collectMatches(content, /import\s*\(\s*((?:\s*"[^"]+")+)/g)
	for (const block of blocks) {
		imports.push(...collectMatches(block, /"([^"]+)"/g))
	}

	return imports
}

/** Parse Java/Kotlin imports. */
function parseJavaKotlinImports(content: string): string[] {
	return collectMatches(content, /^import\s+(\S+);/gm).map((imp) => imp.replace(/\./g, '/'))
}

/** Parse Swift imports. */
function parseSwiftImports(content: string): string[] {
	return collectMatches(content, /^import\s+(\S+)/gm)
}

/** Parse Ruby imports (`require` / `require_relative`). */
function parseRubyImports(content: string): string[] {
	return [
		...collectMatches(content, /require\s+['"]([^'"]+)['"]/g),
		...collectMatches(content, /require_relative\s+['"]([^'"]+)['"]/g),
	]
}

/** Parse PHP imports (`use` / `require` / `include`). */
function parsePhpImports(content: string): string[] {
	return collectMatches(content, /(?:use|require|include)\s+['"]?([^'";\s]+)['"]?/g).map((imp) =>
		imp.replace(/\\/g, '/'),
	)
}

/**
 * Parse import statements from file content.
 *
 * Supports:
 * - ES modules: import X from 'path'
 * - CommonJS: require('path')
 * - Python: import X / from X import Y
 * - Rust: use crate::X / mod X
 * - Go: import "path"
 * - Java/Kotlin/Swift: import X
 */
function parseImports(content: string, extension: string): string[] {
	let imports: string[]

	switch (extension) {
		case '.ts':
		case '.tsx':
		case '.js':
		case '.jsx':
		case '.vue':
		case '.svelte':
			imports = parseJsTsImports(content)
			break
		case '.py':
			imports = parsePythonImports(content)
			break
		case '.rs':
			imports = parseRustImports(content)
			break
		case '.go':
			imports = parseGoImports(content)
			break
		case '.java':
		case '.kt':
			imports = parseJavaKotlinImports(content)
			break
		case '.swift':
			imports = parseSwiftImports(content)
			break
		case '.rb':
			imports = parseRubyImports(content)
			break
		case '.php':
			imports = parsePhpImports(content)
			break
		default:
			return []
	}

	return [...new Set(imports)]
}

// ── Path utilities ────────────────────────────────────────────────────────


/**
 * Check if a file is a test file.
 */
function isTestFile(filePath: string): boolean {
	return TEST_PATTERNS.some((p) => p.test(filePath))
}

/**
 * Check if a file is a config file.
 */
function isConfigFile(filePath: string): boolean {
	return CONFIG_PATTERNS.some((p) => p.test(filePath))
}

/**
 * Determine the architecture node type from path and content.
 */
function determineNodeType(
	relativePath: string,
	extension: string,
): ArchitectureNode['type'] {
	const parts = relativePath.split('/')

	if (isTestFile(relativePath)) return 'test'
	if (isConfigFile(relativePath)) return 'config'

	if (parts[0] === 'src' && parts.length === 2) return 'entry'
	if (parts[0] === 'test' || parts[0] === 'tests') return 'test'
	if (parts[0] === 'config' || parts[0] === 'configs') return 'config'
	if (parts[0] === 'utils' || parts[0] === 'helpers' || parts[0] === 'lib') return 'utility'
	if (parts[0] === 'services') return 'service'
	if (parts[0] === 'components' || parts[0] === 'widgets') return 'component'
	if (parts[0] === 'modules' || parts[0] === 'features') return 'module'

	if (extension === '.vue' || extension === '.svelte') return 'component'

	return 'module'
}

// ── RepositoryIntelligence ────────────────────────────────────────────────

/**
 * Scans and indexes repository structure for intelligence queries.
 *
 * Provides:
 * - Repository map creation from filesystem.
 * - File graph traversal (BFS on import graph).
 * - Dependency chain resolution.
 * - Reverse dependency lookup.
 */
export class RepositoryIntelligence {
	private readonly maps: Map<RepositoryMapId, RepositoryMap> = new Map()

	/**
	 * Resolve an import path to a file path in the graph.
	 *
	 * Import paths may omit file extensions (e.g., "src/foo" vs "src/foo.ts").
	 * This helper tries exact match first, then appends common extensions.
	 */
	private static resolveImportPath(
		fileGraph: FileGraphNode[],
		importPath: string,
	): string | undefined {
		// Exact match.
		if (fileGraph.some((f) => f.path === importPath)) {
			return importPath
		}
		// Try appending common extensions.
		const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".kt", ".swift", ".rb", ".php", ".java"]
		for (const ext of extensions) {
			const candidate = `${importPath}${ext}`
			if (fileGraph.some((f) => f.path === candidate)) {
				return candidate
			}
		}
		// Fallback: try endsWith match (handles relative paths).
		const endsMatch = fileGraph.find((f) => f.path.endsWith(importPath))
		if (endsMatch) {
			return endsMatch.path
		}
		return undefined
	}

	/**
	 * Build the file graph and import edges from provided files.
	 *
	 * Returns the populated fileGraph and importGraph arrays.
	 */
	private static buildFileGraph(
		files: Array<{
			readonly path: string
			readonly content: string
			readonly size: number
			readonly lastModified: string
		}>,
	): { fileGraph: FileGraphNode[]; importGraph: ImportEdge[] } {
		const fileGraph: FileGraphNode[] = []
		const importGraph: ImportEdge[] = []

		for (const file of files) {
			const extension = file.path.includes('.')
				? `.${file.path.split('.').pop()}`
				: ''
			const name = file.path.split('/').pop() ?? file.path

			const imports = PARSEABLE_EXTENSIONS.has(extension)
				? parseImports(file.content, extension)
				: []

			fileGraph.push({
				path: file.path,
				name,
				extension,
				size: file.size,
				lastModified: file.lastModified,
				imports,
				importedBy: [],
				isTest: isTestFile(file.path),
				isConfig: isConfigFile(file.path),
			})

			for (const imp of imports) {
				importGraph.push({
					from: file.path,
					to: imp,
					isExternal: imp.startsWith('node_modules/') || !imp.startsWith('.'),
				})
			}
		}

		// Populate importedBy references.
		for (const node of fileGraph) {
			for (const imp of node.imports) {
				const target = fileGraph.find((f) => f.path === imp || f.path.endsWith(imp))
				if (target) {
					;(target as FileGraphNode & { importedBy: string[] }).importedBy = [
						...target.importedBy,
						node.path,
					]
				}
			}
		}

		return { fileGraph, importGraph }
	}

	/**
	 * Build architecture nodes from the directory structure of the file graph.
	 */
	private static buildArchitectureNodes(fileGraph: FileGraphNode[]): ArchitectureNode[] {
		const dirMap = new Map<string, string[]>()
		for (const file of fileGraph) {
			const dir = file.path.split('/').slice(0, -1).join('/')
			if (!dirMap.has(dir)) {
				dirMap.set(dir, [])
			}
			dirMap.get(dir)!.push(file.path)
		}

		const rootNodes: ArchitectureNode[] = []
		for (const [dirPath, files] of dirMap) {
			const name = dirPath.split('/').pop() ?? 'root'
			const nodeType = determineNodeType(dirPath, '')

			rootNodes.push({
				id: `node-${dirPath}`,
				name,
				type: nodeType,
				path: dirPath,
				children: [],
				dependencies: [],
				capabilities: [],
				description: `${files.length} files`,
			})
		}

		return rootNodes
	}

	/**
	 * Index a repository at the given path.
	 *
	 * This is a simplified in-memory implementation that builds the
	 * structural map from directory structure and file content analysis.
	 * In a production system, this would use the filesystem directly.
	 *
	 * For now, this creates a skeleton map that can be populated
	 * by the caller with actual file data.
	 */
  indexRepository(
		path: string,
		options: {
			readonly files?: Array<{
				readonly path: string
				readonly content: string
				readonly size: number
				readonly lastModified: string
			}>
			readonly gitMetadata?: GitMetadata
		} = {},
	): Promise<RepositoryMap> {
		const id = createRepositoryMapId(`repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
		const now = new Date().toISOString()

		const { fileGraph, importGraph } = options.files
			? RepositoryIntelligence.buildFileGraph(options.files)
			: { fileGraph: [] as FileGraphNode[], importGraph: [] as ImportEdge[] }

		const rootNodes = options.files
			? RepositoryIntelligence.buildArchitectureNodes(fileGraph)
			: []

		const defaultGitMetadata: GitMetadata = options.gitMetadata ?? {
			branch: 'unknown',
			commit: 'unknown',
			lastCommitDate: now,
			contributors: [],
			recentCommits: [],
		}

		const map: RepositoryMap = {
			id,
			repositoryPath: path,
			name: path.split('/').pop() ?? 'unknown',
			rootNodes,
			fileGraph,
			importGraph,
			gitMetadata: defaultGitMetadata,
			indexedAt: now,
			lastUpdated: now,
		}

		this.maps.set(id, map)
		return Promise.resolve(map)
	}

	/**
	 * Get a repository map by ID.
	 */
	getMap(id: RepositoryMapId): RepositoryMap | undefined {
		return this.maps.get(id)
	}

	/**
	 * List all indexed repository maps.
	 */
	listMaps(): RepositoryMap[] {
		return Array.from(this.maps.values())
	}

	/**
	 * Remove a repository map.
	 */
	removeMap(id: RepositoryMapId): boolean {
		return this.maps.delete(id)
	}

	/**
	 * Find related files using BFS on the import graph.
	 *
	 * Traverses both imports and importedBy edges up to maxDepth.
	 */
	findRelatedFiles(
		mapId: RepositoryMapId,
		filePath: string,
		maxDepth = 3,
	): FileGraphNode[] {
		const map = this.maps.get(mapId)
		if (!map) return []

		const visited = new Set<string>()
		const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }]
		const related: FileGraphNode[] = []

		while (queue.length > 0) {
			const current = queue.shift()!
			if (visited.has(current.path)) continue
			if (current.depth > maxDepth) continue

			visited.add(current.path)

			const resolvedPath = RepositoryIntelligence.resolveImportPath(map.fileGraph, current.path) ?? current.path
			const fileNode = map.fileGraph.find((f) => f.path === resolvedPath)
			if (fileNode && current.path !== filePath) {
				related.push(fileNode)
			}

			// Follow imports.
			if (fileNode) {
				for (const imp of fileNode.imports) {
					if (!visited.has(imp)) {
						queue.push({ path: imp, depth: current.depth + 1 })
					}
				}
				for (const impBy of fileNode.importedBy) {
					if (!visited.has(impBy)) {
						queue.push({ path: impBy, depth: current.depth + 1 })
					}
				}
			}
		}

		return related
	}

	/**
	 * Find architecture nodes associated with a capability.
	 */
	findCapabilityNodes(
		mapId: RepositoryMapId,
		capabilityId: string,
	): ArchitectureNode[] {
		const map = this.maps.get(mapId)
		if (!map) return []

		return map.rootNodes.filter((node) =>
			node.capabilities.includes(capabilityId),
		)
	}

	/**
	 * Get the ordered dependency chain for a file.
	 *
	 * Returns the file's import chain in topological order.
	 */
	getDependencyChain(mapId: RepositoryMapId, filePath: string): string[] {
		const map = this.maps.get(mapId)
		if (!map) return []

		const visited = new Set<string>()
		const chain: string[] = []

		const visit = (path: string) => {
			if (visited.has(path)) return
			visited.add(path)

			const resolved = RepositoryIntelligence.resolveImportPath(map.fileGraph, path) ?? path
			const fileNode = map.fileGraph.find((f) => f.path === resolved)
			if (!fileNode) return

			// Visit imports first.
			for (const imp of fileNode.imports) {
				visit(imp)
			}

			chain.push(path)
		}

		visit(filePath)
		return chain
	}

	/**
	 * Get files affected by changes to the given paths.
	 *
	 * Reverse dependency lookup: finds all files that import
	 * any of the changed paths.
	 */
	getAffectedFiles(mapId: RepositoryMapId, changedPaths: string[]): string[] {
		const map = this.maps.get(mapId)
		if (!map) return []

		const affected = new Set<string>()

		for (const changedPath of changedPaths) {
			for (const fileNode of map.fileGraph) {
				if (fileNode.imports.some((imp) => {
					const resolved = RepositoryIntelligence.resolveImportPath(map.fileGraph, imp)
					return resolved === changedPath || imp === changedPath
				})) {
					affected.add(fileNode.path)
				}
			}
		}

		return Array.from(affected)
	}

	/**
	 * Get full context for a file.
	 */
	getFileContext(
		mapId: RepositoryMapId,
		filePath: string,
	): {
		node?: ArchitectureNode
		file?: FileGraphNode
		imports: string[]
		importedBy: string[]
	} {
		const map = this.maps.get(mapId)
		if (!map) return { imports: [], importedBy: [] }

		const file = map.fileGraph.find((f) => f.path === filePath)
		const node = map.rootNodes.find((n) => filePath.startsWith(n.path))

		return {
			node,
			file,
			imports: file?.imports ?? [],
			importedBy: file?.importedBy ?? [],
		}
	}
}
