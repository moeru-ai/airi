import type { Neuri } from 'neuri'

import type { Action } from '../../libs/mineflayer/action'
import type { ActionAgent, AgentConfig, MemoryAgent, Plan, PlanningAgent } from '../../libs/mineflayer/base-agent'
import type { PlanStep } from './adapter'

import { AbstractAgent } from '../../libs/mineflayer/base-agent'
import { ActionAgentImpl } from '../action'
import { PlanningLLMHandler } from './adapter'

interface PlanContext {
  goal: string
  currentStep: number
  startTime: number
  lastUpdate: number
  retryCount: number
  isGenerating: boolean
  pendingSteps: PlanStep[]
}

export interface PlanningAgentConfig extends AgentConfig {
  llm: {
    agent: Neuri
    model?: string
  }
}

export class PlanningAgentImpl extends AbstractAgent implements PlanningAgent {
  public readonly type = 'planning' as const
  private currentPlan: Plan | null = null
  private context: PlanContext | null = null
  private actionAgent: ActionAgent | null = null
  private memoryAgent: MemoryAgent | null = null
  private llmConfig: PlanningAgentConfig['llm']
  private llmHandler: PlanningLLMHandler

  constructor(config: PlanningAgentConfig) {
    super(config)
    this.llmConfig = config.llm
    this.llmHandler = new PlanningLLMHandler({
      agent: this.llmConfig.agent,
      model: this.llmConfig.model,
    })
  }

  protected async initializeAgent(): Promise<void> {
    this.logger.log('Initializing planning agent')

    // Create action agent directly
    this.actionAgent = new ActionAgentImpl({
      id: 'action',
      type: 'action',
    })
    await this.actionAgent.init()

    // Set event listener
    this.on('message', async ({ sender, message }) => {
      await this.handleAgentMessage(sender, message)
    })

    this.on('interrupt', () => {
      this.handleInterrupt()
    })
  }

  protected async destroyAgent(): Promise<void> {
    this.currentPlan = null
    this.context = null
    this.actionAgent = null
    this.memoryAgent = null
    this.removeAllListeners()
  }

  public async createPlan(goal: string): Promise<Plan> {
    if (!this.initialized) {
      throw new Error('Planning agent not initialized')
    }

    this.logger.withField('goal', goal).log('Creating plan')

    try {
      // Check memory for existing plan
      const cachedPlan = await this.loadCachedPlan(goal)
      if (cachedPlan) {
        this.logger.log('Using cached plan')
        return cachedPlan
      }

      // Get available actions from action agent
      const availableActions = this.actionAgent?.getAvailableActions() ?? []

      // Check if the goal requires actions
      const requirements = this.parseGoalRequirements(goal)
      const requiresAction = this.doesGoalRequireAction(requirements)

      // If no actions needed, return empty plan
      if (!requiresAction) {
        this.logger.log('Goal does not require actions')
        return {
          goal,
          steps: [],
          status: 'completed',
          requiresAction: false,
        }
      }

      // Create plan steps based on available actions and goal
      const steps = await this.generatePlanSteps(goal, availableActions, 'system')

      // Create new plan
      const plan: Plan = {
        goal,
        steps,
        status: 'pending',
        requiresAction: true,
      }

      // Cache the plan
      await this.cachePlan(plan)

      this.currentPlan = plan
      this.context = {
        goal,
        currentStep: 0,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        retryCount: 0,
        isGenerating: false,
        pendingSteps: [],
      }

      return plan
    }
    catch (error) {
      this.logger.withError(error).error('Failed to create plan')
      throw error
    }
  }

  public async executePlan(plan: Plan): Promise<void> {
    if (!this.initialized) {
      throw new Error('Planning agent not initialized')
    }

    if (!plan.requiresAction) {
      this.logger.log('Plan does not require actions, skipping execution')
      return
    }

    if (!this.actionAgent) {
      throw new Error('Action agent not available')
    }

    this.logger.withField('plan', plan).log('Executing plan')

    try {
      plan.status = 'in_progress'
      this.currentPlan = plan

      // Execute each step
      for (const step of plan.steps) {
        try {
          this.logger.withField('step', step).log('Executing step')
          await this.actionAgent.performAction(step)
        }
        catch (stepError) {
          this.logger.withError(stepError).error('Failed to execute step')

          // Attempt to adjust plan and retry
          if (this.context && this.context.retryCount < 3) {
            this.context.retryCount++
            // Adjust plan and restart
            const adjustedPlan = await this.adjustPlan(
              plan,
              stepError instanceof Error ? stepError.message : 'Unknown error',
              'system',
            )
            await this.executePlan(adjustedPlan)
            return
          }

          throw stepError
        }
      }

      plan.status = 'completed'
    }
    catch (error) {
      plan.status = 'failed'
      throw error
    }
    finally {
      this.context = null
    }
  }

  // private async generateStepsStream(
  //   goal: string,
  //   availableActions: Action[],
  //   sender: string,
  // ): Promise<void> {
  //   if (!this.context) {
  //     return
  //   }

  //   try {
  //     // Generate all steps at once
  //     const steps = await this.llmHandler.generatePlan(goal, availableActions, sender)
  //     if (!this.context.isGenerating) {
  //       return
  //     }

  //     // Add all steps to pending queue
  //     this.context.pendingSteps.push(...steps)
  //     this.logger.withField('steps', steps).log('Generated steps')
  //   }
  //   catch (error) {
  //     this.logger.withError(error).error('Failed to generate steps')
  //     throw error
  //   }
  //   finally {
  //     this.context.isGenerating = false
  //   }
  // }

  // private async executeStepsStream(): Promise<void> {
  //   if (!this.context || !this.actionAgent) {
  //     return
  //   }

  //   try {
  //     while (this.context.isGenerating || this.context.pendingSteps.length > 0) {
  //       // Wait for steps to be available
  //       if (this.context.pendingSteps.length === 0) {
  //         await new Promise(resolve => setTimeout(resolve, 100))
  //         continue
  //       }

  //       // Execute next step
  //       const step = this.context.pendingSteps.shift()
  //       if (!step) {
  //         continue
  //       }

  //       try {
  //         this.logger.withField('step', step).log('Executing step')
  //         await this.actionAgent.performAction(step)
  //         this.context.lastUpdate = Date.now()
  //         this.context.currentStep++
  //       }
  //       catch (stepError) {
  //         this.logger.withError(stepError).error('Failed to execute step')

  //         // Attempt to adjust plan and retry
  //         if (this.context.retryCount < 3) {
  //           this.context.retryCount++
  //           // Stop current generation
  //           this.context.isGenerating = false
  //           this.context.pendingSteps = []
  //           // Adjust plan and restart
  //           const adjustedPlan = await this.adjustPlan(
  //             this.currentPlan!,
  //             stepError instanceof Error ? stepError.message : 'Unknown error',
  //             'system',
  //           )
  //           await this.executePlan(adjustedPlan)
  //           return
  //         }

  //         throw stepError
  //       }
  //     }
  //   }
  //   catch (error) {
  //     this.logger.withError(error).error('Failed to execute steps')
  //     throw error
  //   }
  // }

  // private async *createStepGenerator(
  //   goal: string,
  //   availableActions: Action[],
  // ): AsyncGenerator<PlanStep[], void, unknown> {
  //   // Use LLM to generate plan in chunks
  //   this.logger.log('Generating plan using LLM')
  //   const chunkSize = 3 // Generate 3 steps at a time
  //   let currentChunk = 1

  //   while (true) {
  //     const steps = await this.llmHandler.generatePlan(
  //       goal,
  //       availableActions,
  //       `Generate steps ${currentChunk * chunkSize - 2} to ${currentChunk * chunkSize}`,
  //     )

  //     if (steps.length === 0) {
  //       break
  //     }

  //     yield steps
  //     currentChunk++

  //     // Check if we've generated enough steps or if the goal is achieved
  //     if (steps.length < chunkSize || await this.isGoalAchieved(goal)) {
  //       break
  //     }
  //   }
  // }

  // private async isGoalAchieved(goal: string): Promise<boolean> {
  //   if (!this.context || !this.actionAgent) {
  //     return false
  //   }

  //   const requirements = this.parseGoalRequirements(goal)

  //   // Check inventory for required items
  //   if (requirements.needsItems && requirements.items) {
  //     const inventorySteps = this.generateGatheringSteps(requirements.items)
  //     if (inventorySteps.length > 0) {
  //       this.context.pendingSteps.push(...inventorySteps)
  //       return false
  //     }
  //   }

  //   // Check location requirements
  //   if (requirements.needsMovement && requirements.location) {
  //     const movementSteps = this.generateMovementSteps(requirements.location)
  //     if (movementSteps.length > 0) {
  //       this.context.pendingSteps.push(...movementSteps)
  //       return false
  //     }
  //   }

  //   // Check interaction requirements
  //   if (requirements.needsInteraction && requirements.target) {
  //     const interactionSteps = this.generateInteractionSteps(requirements.target)
  //     if (interactionSteps.length > 0) {
  //       this.context.pendingSteps.push(...interactionSteps)
  //       return false
  //     }
  //   }

  //   return true
  // }

  public async adjustPlan(plan: Plan, feedback: string, sender: string): Promise<Plan> {
    if (!this.initialized) {
      throw new Error('Planning agent not initialized')
    }

    this.logger.withFields({ plan, feedback }).log('Adjusting plan')

    try {
      // If there's a current context, use it to adjust the plan
      if (this.context) {
        const currentStep = this.context.currentStep
        const availableActions = this.actionAgent?.getAvailableActions() ?? []

        // Generate recovery steps based on feedback
        const recoverySteps = this.generateRecoverySteps(feedback)

        // Generate new steps from the current point
        const newSteps = await this.generatePlanSteps(plan.goal, availableActions, sender, feedback)

        // Create adjusted plan
        const adjustedPlan: Plan = {
          goal: plan.goal,
          steps: [
            ...plan.steps.slice(0, currentStep),
            ...recoverySteps,
            ...newSteps,
          ],
          status: 'pending',
          requiresAction: true,
        }

        return adjustedPlan
      }

      // If no context, create a new plan
      return this.createPlan(plan.goal)
    }
    catch (error) {
      this.logger.withError(error).error('Failed to adjust plan')
      throw error
    }
  }

  // private generateGatheringSteps(items: string[]): PlanStep[] {
  //   const steps: PlanStep[] = []

  //   for (const item of items) {
  //     steps.push(
  //       {
  //         description: `Search for ${item} in the surrounding area`,
  //         tool: 'searchForBlock',
  //         params: {
  //           blockType: item,
  //           range: 64,
  //         },
  //       },
  //       {
  //         description: `Collect ${item} from the found location`,
  //         tool: 'collectBlocks',
  //         params: {
  //           blockType: item,
  //           count: 1,
  //         },
  //       },
  //     )
  //   }

  //   return steps
  // }

  // private generateMovementSteps(location: { x?: number, y?: number, z?: number }): PlanStep[] {
  //   if (location.x !== undefined && location.y !== undefined && location.z !== undefined) {
  //     return [{
  //       description: `Move to coordinates (${location.x}, ${location.y}, ${location.z})`,
  //       tool: 'goToCoordinates',
  //       params: {
  //         x: location.x,
  //         y: location.y,
  //         z: location.z,
  //       },
  //     }]
  //   }
  //   return []
  // }

  // private generateInteractionSteps(target: string): PlanStep[] {
  //   return [{
  //     description: `Interact with ${target}`,
  //     tool: 'activate',
  //     params: {
  //       target,
  //     },
  //   }]
  // }

  private generateRecoverySteps(feedback: string): PlanStep[] {
    const steps: PlanStep[] = []

    if (feedback.includes('not found')) {
      steps.push({
        description: 'Search in a wider area',
        tool: 'searchForBlock',
        params: {
          blockType: 'oak_log',
          range: 64,
        },
      })
    }

    if (feedback.includes('inventory full')) {
      steps.push({
        description: 'Clear inventory space',
        tool: 'discard',
        params: {
          blockType: 'oak_log',
          count: 1,
        },
      })
    }

    if (feedback.includes('blocked') || feedback.includes('cannot reach')) {
      steps.push({
        description: 'Move away from obstacles',
        tool: 'moveAway',
        params: {
          range: 64,
        },
      })
    }

    if (feedback.includes('too far')) {
      steps.push({
        description: 'Move closer to target',
        tool: 'moveAway',
        params: {
          range: 64,
        },
      })
    }

    if (feedback.includes('need tool')) {
      steps.push(
        {
          description: 'Craft a wooden pickaxe',
          tool: 'craftRecipe',
          params: {
            recipe: 'oak_pickaxe',
          },
        },
        {
          description: 'Equip the wooden pickaxe',
          tool: 'equip',
          params: {
            item: 'oak_pickaxe',
          },
        },
      )
    }

    return steps
  }

  private async loadCachedPlan(goal: string): Promise<Plan | null> {
    if (!this.memoryAgent)
      return null

    const cachedPlan = this.memoryAgent.recall<Plan>(`plan:${goal}`)
    if (cachedPlan && this.isPlanValid(cachedPlan)) {
      return cachedPlan
    }
    return null
  }

  private async cachePlan(plan: Plan): Promise<void> {
    if (!this.memoryAgent)
      return

    this.memoryAgent.remember(`plan:${plan.goal}`, plan)
  }

  private isPlanValid(_plan: Plan): boolean {
    // Add validation logic here
    return true
  }

  private async handleAgentMessage(sender: string, message: string): Promise<void> {
    if (sender === 'system') {
      if (message.includes('interrupt')) {
        this.handleInterrupt()
      }
    }
    else {
      // Process message and potentially adjust plan
      this.logger.withFields({ sender, message }).log('Processing agent message')

      // If there's a current plan, try to adjust it based on the message
      if (this.currentPlan) {
        await this.adjustPlan(this.currentPlan, message, sender)
      }
    }
  }

  private handleInterrupt(): void {
    if (this.currentPlan) {
      this.currentPlan.status = 'failed'
      this.context = null
    }
  }

  private doesGoalRequireAction(requirements: ReturnType<typeof this.parseGoalRequirements>): boolean {
    // Check if any requirement indicates need for action
    return requirements.needsItems
      || requirements.needsMovement
      || requirements.needsInteraction
      || requirements.needsCrafting
      || requirements.needsCombat
  }

  private async generatePlanSteps(
    goal: string,
    availableActions: Action[],
    sender: string,
    feedback?: string,
  ): Promise<PlanStep[]> {
    // Generate all steps at once
    this.logger.log('Generating plan using LLM')
    return await this.llmHandler.generatePlan(goal, availableActions, sender, feedback)
  }

  private parseGoalRequirements(goal: string): {
    needsItems: boolean
    items?: string[]
    needsMovement: boolean
    location?: { x?: number, y?: number, z?: number }
    needsInteraction: boolean
    target?: string
    needsCrafting: boolean
    needsCombat: boolean
  } {
    const requirements = {
      needsItems: false,
      items: [] as string[],
      needsMovement: false,
      location: undefined as { x?: number, y?: number, z?: number } | undefined,
      needsInteraction: false,
      target: undefined as string | undefined,
      needsCrafting: false,
      needsCombat: false,
    }

    const goalLower = goal.toLowerCase()

    // Extract items from goal
    const itemMatches = goalLower.match(/(collect|get|find|craft|make|build|use|equip) (\w+)/g)
    if (itemMatches) {
      requirements.needsItems = true
      requirements.items = itemMatches.map(match => match.split(' ')[1])
    }

    // Extract location from goal
    const locationMatches = goalLower.match(/(go to|move to|at) (\d+)[, ]+(\d+)[, ]+(\d+)/g)
    if (locationMatches) {
      requirements.needsMovement = true
      const [x, y, z] = locationMatches[0].split(/[, ]+/).slice(-3).map(Number)
      requirements.location = { x, y, z }
    }

    // Extract target from goal
    const targetMatches = goalLower.match(/(interact with|use|open|activate) (\w+)/g)
    if (targetMatches) {
      requirements.needsInteraction = true
      requirements.target = targetMatches[0].split(' ').pop()
    }

    // Check for item-related actions
    if (goalLower.includes('collect') || goalLower.includes('get') || goalLower.includes('find')) {
      requirements.needsItems = true
      requirements.needsMovement = true
    }

    // Check for movement-related actions
    if (goalLower.includes('go to') || goalLower.includes('move to') || goalLower.includes('follow')) {
      requirements.needsMovement = true
    }

    // Check for interaction-related actions
    if (goalLower.includes('interact') || goalLower.includes('use') || goalLower.includes('open')) {
      requirements.needsInteraction = true
    }

    // Check for crafting-related actions
    if (goalLower.includes('craft') || goalLower.includes('make') || goalLower.includes('build')) {
      requirements.needsCrafting = true
      requirements.needsItems = true
    }

    // Check for combat-related actions
    if (goalLower.includes('attack') || goalLower.includes('fight') || goalLower.includes('kill')) {
      requirements.needsCombat = true
      requirements.needsMovement = true
    }

    return requirements
  }
}
