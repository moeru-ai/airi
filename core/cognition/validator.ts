/**
 * AIRI Core — Plan Validator
 *
 * Validates plan proposals before they reach the planner.
 *
 * The validator — NOT the LLM — decides admissibility.
 * Plans must be safe, feasible, and deterministic.
 *
 * Validation checks:
 * 1. All required capabilities are registered.
 * 2. All workspace requirements can be met.
 * 3. Dependency graph is valid (no cycles, all deps exist).
 * 4. Step actions map to known tools.
 * 5. Execution constraints are satisfiable.
 */

import type {
	PlanProposal,
	ProposedStep,
	ValidationResult,
	ValidationError,
	ValidationWarning,
} from "./types.js"
import { createToolId } from "../capabilities/types.js"
import type { CapabilityRegistry } from "../capabilities/registry.js"
import type { WorkspaceManager } from "../workspace/manager.js"

/**
 * Validates plan proposals before they reach the planner.
 *
 * The validator — NOT the LLM — decides admissibility.
 * Plans must be safe, feasible, and deterministic.
 */
export class PlanValidator {
	private readonly capabilityRegistry: CapabilityRegistry
	private readonly workspaceManager: WorkspaceManager

	constructor(
		capabilityRegistry: CapabilityRegistry,
		workspaceManager: WorkspaceManager,
	) {
		this.capabilityRegistry = capabilityRegistry
		this.workspaceManager = workspaceManager
	}

	/**
	 * Validate a plan proposal.
	 *
	 * Checks:
	 * 1. All required capabilities are registered
	 * 2. All workspace requirements can be met
	 * 3. Dependency graph is valid (no cycles, all deps exist)
	 * 4. Step actions map to known tools
	 * 5. Execution constraints are satisfiable
	 */
	validate(proposal: PlanProposal): ValidationResult {
		const errors: ValidationError[] = []
		const warnings: ValidationWarning[] = []

		// 1. Validate capability requirements.
		errors.push(...this.validateCapabilities(proposal))

		// 2. Validate workspace requirements.
		errors.push(...this.validateWorkspaces(proposal))

		// 3. Validate dependency graph.
		errors.push(...PlanValidator.validateDependencyGraph(proposal.steps))

		// 4. Validate step actions.
		errors.push(...this.validateStepActions(proposal.steps))

		// 5. Validate execution constraints.
		warnings.push(...PlanValidator.validateConstraints(proposal))

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			normalizedSteps: proposal.steps.length,
		}
	}

	/**
	 * Validate capability requirements.
	 */
	private validateCapabilities(proposal: PlanProposal): ValidationError[] {
		const errors: ValidationError[] = []

		for (const capabilityId of proposal.capabilityRequirements) {
			const info = this.capabilityRegistry.get(capabilityId)
			if (!info) {
				errors.push({
					code: "UNKNOWN_CAPABILITY",
					message: `Required capability "${capabilityId}" is not registered`,
				})
			} else if (info.status === "deregistered" || info.status === "failed") {
				errors.push({
					code: "UNAVAILABLE_CAPABILITY",
					message: `Required capability "${capabilityId}" is ${info.status}`,
					stepId: undefined,
				})
			}
		}

		// Also check step-level capability requirements.
		for (const step of proposal.steps) {
			if (step.capabilityRequirement) {
				const info = this.capabilityRegistry.get(step.capabilityRequirement)
				if (!info) {
					errors.push({
						code: "UNKNOWN_STEP_CAPABILITY",
						message: `Step "${step.name}" requires capability "${step.capabilityRequirement}" which is not registered`,
						stepId: step.id,
					})
				}
			}
		}

		return errors
	}

	/**
	 * Validate workspace requirements.
	 */
	private validateWorkspaces(proposal: PlanProposal): ValidationError[] {
		const errors: ValidationError[] = []

		for (const req of proposal.workspaceRequirements) {
			if (req.workspaceId) {
				const descriptor = this.workspaceManager.getWorkspace(req.workspaceId)
				if (!descriptor) {
					errors.push({
						code: "UNKNOWN_WORKSPACE",
						message: `Required workspace "${req.workspaceId}" does not exist`,
					})
				} else if (descriptor.state === "destroyed" || descriptor.state === "destroying") {
					errors.push({
						code: "UNAVAILABLE_WORKSPACE",
						message: `Required workspace "${req.workspaceId}" is ${descriptor.state}`,
					})
				}
			}
		}

		// Also check step-level workspace requirements.
		for (const step of proposal.steps) {
			if (step.workspaceRequirement) {
				const descriptor = this.workspaceManager.getWorkspace(step.workspaceRequirement)
				if (!descriptor) {
					errors.push({
						code: "UNKNOWN_STEP_WORKSPACE",
						message: `Step "${step.name}" requires workspace "${step.workspaceRequirement}" which does not exist`,
						stepId: step.id,
					})
				}
			}
		}

		return errors
	}

	/**
	 * Validate the dependency graph.
	 *
	 * Checks:
	 * - All dependency references point to existing steps.
	 * - No circular dependencies (cycle detection via DFS).
	 */
	private static validateDependencyGraph(steps: ProposedStep[]): ValidationError[] {
		const errors: ValidationError[] = []
		const stepIds = new Set(steps.map((s) => s.id))

		// Check all dependency references exist.
		for (const step of steps) {
			if (step.dependencyIds) {
				for (const depId of step.dependencyIds) {
					if (!stepIds.has(depId)) {
						errors.push({
							code: "MISSING_DEPENDENCY",
							message: `Step "${step.name}" depends on step "${depId}" which does not exist`,
							stepId: step.id,
						})
					}
				}
			}
		}

		// Check for cycles using DFS.
		// Build adjacency list: step -> steps that depend on it.
		const adjacency = new Map<string, string[]>()
		for (const step of steps) {
			adjacency.set(step.id, [])
		}
		for (const step of steps) {
			if (step.dependencyIds) {
				for (const depId of step.dependencyIds) {
					if (stepIds.has(depId)) {
						const deps = adjacency.get(depId) ?? []
						deps.push(step.id)
						adjacency.set(depId, deps)
					}
				}
			}
		}

		// DFS cycle detection.
		const WHITE = 0 // Not visited
		const GRAY = 1  // In current path
		const BLACK = 2 // Fully processed
		const color = new Map<string, number>()
		for (const step of steps) {
			color.set(step.id, WHITE)
		}

		const path: string[] = []

		function dfs(node: string): boolean {
			color.set(node, GRAY)
			path.push(node)

			const neighbors = adjacency.get(node) ?? []
			for (const neighbor of neighbors) {
				if (color.get(neighbor) === GRAY) {
					// Cycle detected.
					const cycleStart = path.indexOf(neighbor)
					const cycle = path.slice(cycleStart).join(" -> ")
					errors.push({
						code: "CYCLIC_DEPENDENCY",
						message: `Circular dependency detected: ${cycle} -> ${neighbor}`,
						stepId: node,
					})
					return true
				}
				if (color.get(neighbor) === WHITE) {
					if (dfs(neighbor)) return true
				}
			}

			path.pop()
			color.set(node, BLACK)
			return false
		}

		for (const step of steps) {
			if (color.get(step.id) === WHITE) {
				dfs(step.id)
			}
		}

		return errors
	}

	/**
	 * Validate step actions map to known tools.
	 */
	private validateStepActions(steps: ProposedStep[]): ValidationError[] {
		const errors: ValidationError[] = []

		for (const step of steps) {
			if (!this.capabilityRegistry.hasTool(createToolId(step.action))) {
				errors.push({
					code: "UNKNOWN_ACTION",
					message: `Step "${step.name}" uses action "${step.action}" which is not a registered tool`,
					stepId: step.id,
				})
			}
		}

		return errors
	}

	/**
	 * Validate execution constraints.
	 */
	private static validateConstraints(proposal: PlanProposal): ValidationWarning[] {
		const warnings: ValidationWarning[] = []

		// Check for empty proposals.
		if (proposal.steps.length === 0) {
			warnings.push({
				code: "EMPTY_PROPOSAL",
				message: "Proposal has no steps",
			})
		}

		// Check for very large proposals.
		if (proposal.steps.length > 100) {
			warnings.push({
				code: "LARGE_PROPOSAL",
				message: `Proposal has ${proposal.steps.length} steps — consider breaking into smaller plans`,
			})
	}

		// Check for steps with very long timeouts.
		for (const step of proposal.steps) {
			if (step.timeoutMs && step.timeoutMs > 300_000) {
				warnings.push({
					code: "LONG_TIMEOUT",
					message: `Step "${step.name}" has a timeout of ${step.timeoutMs}ms (>5 minutes)`,
					stepId: step.id,
				})
			}
		}

		return warnings
	}

	/**
	 * Normalize a validated proposal into planner-compatible format.
	 *
	 * - Assigns proper StepIds (via proposalToPlan for the actual conversion).
	 * - Resolves dependency references.
	 * - Sets default timeouts.
	 */
	static normalize(proposal: PlanProposal): PlanProposal {
		const normalizedSteps = proposal.steps.map((step) => ({
			...step,
			timeoutMs: step.timeoutMs ?? 30_000,
			dependencyIds: step.dependencyIds ?? [],
		}))

		return {
			...proposal,
			steps: normalizedSteps,
		}
	}
}
