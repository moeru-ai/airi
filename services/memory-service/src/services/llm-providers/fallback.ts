import type { ProcessingBatch } from '../background-trigger.js'
import type { StructuredLLMResponse } from '../llm-memory-manager.js'
import type { LLMProvider } from './base.js'

export class FallbackProvider implements LLMProvider {
  getProviderName(): string {
    return 'Fallback (Heuristic)'
  }

  async processBatch(batch: ProcessingBatch): Promise<StructuredLLMResponse> {
    console.warn('Using fallback provider - no LLM configured')

    const memoryFragments: StructuredLLMResponse['memoryFragments'] = []
    const goals: StructuredLLMResponse['goals'] = []
    const ideas: StructuredLLMResponse['ideas'] = []
    const episodes: StructuredLLMResponse['episodes'] = []
    const entities: StructuredLLMResponse['entities'] = []
    const entityRelations: StructuredLLMResponse['entityRelations'] = []
    const consolidatedMemories: StructuredLLMResponse['consolidatedMemories'] = []

    // Create a single episode for the batch if it has multiple messages
    if (batch.messages.length > 1) {
      episodes.push({
        episodeType: 'chat_session',
        title: `Chat session with ${batch.messages.length} messages`,
        startTime: Date.now(),
        endTime: undefined,
        metadata: { messageCount: batch.messages.length },
      })
    }

    for (const message of batch.messages) {
      const content = message.content.toLowerCase()

      // Create memory fragment
      memoryFragments.push({
        content: message.content,
        memoryType: this.determineMemoryType(content),
        category: this.determineCategory(content),
        importance: this.determineImportance(content),
        emotionalImpact: this.determineEmotionalImpact(content),
        tags: this.generateTags(content),
      })

      // Extract entities (simple heuristic-based extraction)
      const extractedEntities = this.extractEntities(message.content)
      for (const entity of extractedEntities) {
        if (!entities.some(e => e.name.toLowerCase() === entity.name.toLowerCase())) {
          entities.push(entity)
        }
      }

      // Create entity relations
      for (const entity of extractedEntities) {
        entityRelations.push({
          entityName: entity.name,
          memoryContent: message.content,
          importance: this.determineImportance(content),
          relationshipType: 'mentioned',
          confidence: 6,
        })
      }

      // Extract goals
      if (content.includes('goal') || content.includes('plan') || content.includes('want to') || content.includes('need to')) {
        goals.push({
          title: `Goal: ${message.content.substring(0, 50)}...`,
          description: message.content,
          priority: 7,
          category: 'personal',
        })
      }

      // Extract ideas
      if (content.includes('idea') || content.includes('thought') || content.includes('maybe') || content.includes('what if')) {
        ideas.push({
          content: message.content,
          sourceType: 'conversation',
          excitement: 6,
          status: 'new',
        })
      }
    }

    // Create consolidated memories if we have multiple related fragments
    if (memoryFragments.length > 1) {
      const relatedFragments = memoryFragments.filter(f =>
        f.category === memoryFragments[0].category
        || f.importance >= 7,
      )

      if (relatedFragments.length > 1) {
        consolidatedMemories.push({
          content: `Summary of ${relatedFragments.length} related ${memoryFragments[0].category} memories`,
          summaryType: 'summary',
          sourceFragmentContents: relatedFragments.map(f => f.content),
          metadata: {
            category: memoryFragments[0].category,
            fragmentCount: relatedFragments.length,
          },
        })
      }
    }

    return {
      memoryFragments,
      goals,
      ideas,
      episodes,
      entities,
      entityRelations,
      consolidatedMemories,
    }
  }

  private determineMemoryType(content: string): 'working' | 'short_term' | 'long_term' | 'muscle' {
    if (content.includes('goal') || content.includes('plan') || content.includes('future') || content.includes('deadline')) {
      return 'long_term'
    }
    if (content.includes('how to') || content.includes('procedure') || content.includes('steps') || content.includes('process')) {
      return 'muscle'
    }
    if (content.includes('remember') || content.includes('important') || content.includes('key') || content.includes('critical')) {
      return 'long_term'
    }
    return 'short_term'
  }

  private determineCategory(content: string): string {
    if (content.includes('work') || content.includes('job') || content.includes('project') || content.includes('meeting')) {
      return 'work'
    }
    if (content.includes('friend') || content.includes('family') || content.includes('person') || content.includes('relationship')) {
      return 'relationships'
    }
    if (content.includes('idea') || content.includes('thought') || content.includes('concept') || content.includes('innovation')) {
      return 'ideas'
    }
    if (content.includes('feeling') || content.includes('emotion') || content.includes('happy') || content.includes('sad') || content.includes('angry')) {
      return 'emotions'
    }
    return 'general'
  }

  private determineImportance(content: string): number {
    if (content.includes('critical') || content.includes('urgent') || content.includes('essential')) {
      return 9
    }
    if (content.includes('important') || content.includes('key') || content.includes('priority')) {
      return 7
    }
    if (content.includes('trivial') || content.includes('unimportant') || content.includes('minor')) {
      return 2
    }
    return 5
  }

  private determineEmotionalImpact(content: string): number {
    if (content.includes('excited') || content.includes('thrilled') || content.includes('amazing')) {
      return 8
    }
    if (content.includes('happy') || content.includes('great') || content.includes('good')) {
      return 5
    }
    if (content.includes('frustrated') || content.includes('angry') || content.includes('mad')) {
      return -7
    }
    if (content.includes('sad') || content.includes('disappointed') || content.includes('upset')) {
      return -5
    }
    return 0
  }

  private generateTags(content: string): string[] {
    const tags: string[] = []
    if (content.includes('work'))
      tags.push('work')
    if (content.includes('personal'))
      tags.push('personal')
    if (content.includes('urgent'))
      tags.push('urgent')
    if (content.includes('idea'))
      tags.push('idea')
    if (content.includes('goal'))
      tags.push('goal')
    if (content.includes('project'))
      tags.push('project')
    if (content.includes('family'))
      tags.push('family')
    if (content.includes('friend'))
      tags.push('friend')
    return tags
  }

  private extractEntities(content: string): Array<{ name: string, entityType: 'person' | 'place' | 'organization' | 'concept' | 'thing' }> {
    const entities: Array<{ name: string, entityType: 'person' | 'place' | 'organization' | 'concept' | 'thing' }> = []

    // Simple heuristic-based entity extraction
    const words = content.split(/\s+/)

    for (const word of words) {
      const cleanWord = word.replace(/\W/g, '')

      // Skip short words and common words
      if (cleanWord.length < 3 || ['the', 'and', 'but', 'for', 'are', 'was', 'were', 'have', 'has', 'had', 'will', 'would', 'could', 'should'].includes(cleanWord.toLowerCase())) {
        continue
      }

      // Capitalized words might be names/places
      if (cleanWord[0] === cleanWord[0]?.toUpperCase() && cleanWord.length > 2) {
        if (cleanWord.length > 4) {
          entities.push({ name: cleanWord, entityType: 'person' })
        }
        else {
          entities.push({ name: cleanWord, entityType: 'place' })
        }
      }

      // Specific entity patterns
      if (cleanWord.toLowerCase().includes('company') || cleanWord.toLowerCase().includes('corp') || cleanWord.toLowerCase().includes('inc')) {
        entities.push({ name: cleanWord, entityType: 'organization' })
      }
    }

    return entities
  }
}
