import { describe, expect, it } from 'vitest'

import { classifyTask, createTaskState, updateTaskState } from './task-discipline'

describe('task-discipline', () => {
  describe('classifyTask', () => {
    it('classifies "write a report" goals as analysis_report', () => {
      expect(classifyTask('Analyze packages/stage-ui/src/stores/ for unused exports.')).toBe('analysis_report')
      expect(classifyTask('Write a report of all dead code in the project.')).toBe('analysis_report')
      expect(classifyTask('Find unused exports and list them.')).toBe('analysis_report')
      expect(classifyTask('Audit the codebase for deprecated APIs.')).toBe('analysis_report')
      expect(classifyTask('Document all exported symbols in src/utils.')).toBe('analysis_report')
    })

    it('classifies "fix/edit" goals as existing_file_edit', () => {
      expect(classifyTask('Fix the type error in src/foo.ts')).toBe('existing_file_edit')
      expect(classifyTask('Add JSDoc comments to all exported functions in utils.ts')).toBe('existing_file_edit')
      expect(classifyTask('Refactor the useTheme composable to accept options')).toBe('existing_file_edit')
      expect(classifyTask('Replace all uses of the old API with the new one')).toBe('existing_file_edit')
      expect(classifyTask('Rename the function from foo to bar in src/index.ts')).toBe('existing_file_edit')
    })

    it('classifies "run tests / verify" goals as verification_heavy', () => {
      expect(classifyTask('Run the test suite and fix any failures')).toBe('existing_file_edit')
      expect(classifyTask('Run tests to verify the build is green')).toBe('verification_heavy')
      expect(classifyTask('Typecheck the project and report errors')).toBe('analysis_report')
      expect(classifyTask('Make sure the vitest suite passes')).toBe('verification_heavy')
    })

    it('falls through to general_fix for ambiguous goals', () => {
      expect(classifyTask('Implement a new feature for the dashboard')).toBe('general_fix')
      expect(classifyTask('Set up the CI pipeline')).toBe('general_fix')
      expect(classifyTask('Create the new component')).toBe('general_fix')
    })
  })

  describe('createTaskState', () => {
    it('creates state with correct defaults', () => {
      const state = createTaskState('analysis_report')
      expect(state.taskKind).toBe('analysis_report')
      expect(state.phase).toBe('exploring')
      expect(state.targetLocked).toBe(false)
      expect(state.reportWritten).toBe(false)
      expect(state.existingFileEdited).toBe(false)
      expect(state.readBackDone).toBe(false)
      expect(state.verificationAttempted).toBe(false)
      expect(state.bashNoProgressCount).toBe(0)
    })
  })

  describe('updateTaskState', () => {
    it('locks target on read_file for any task kind', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'read_file', { file_path: 'src/foo.ts' }, '...content...', false)
      expect(state.targetLocked).toBe(true)
      expect(state.primaryTargetFile).toBe('src/foo.ts')
      expect(state.phase).toBe('target_locked')
    })

    it('edit_file also locks target and sets primaryTargetFile', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'edit_file', { file_path: 'src/bar.ts', old_text: 'a', new_text: 'b' }, 'ok', false)
      expect(state.targetLocked).toBe(true)
      expect(state.primaryTargetFile).toBe('src/bar.ts')
      expect(state.phase).toBe('editing')
    })

    it('does not advance on error', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'read_file', { file_path: 'src/foo.ts' }, '[ERROR] not found', true)
      expect(state.targetLocked).toBe(false)
      expect(state.phase).toBe('exploring')
    })

    it('marks existingFileEdited on edit_file', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'edit_file', { file_path: 'src/foo.ts', old_text: 'a', new_text: 'b' }, 'ok', false)
      expect(state.existingFileEdited).toBe(true)
      expect(state.phase).toBe('editing')
    })

    it('marks reportWritten on write_file for analysis tasks', () => {
      const state = createTaskState('analysis_report')
      updateTaskState(state, 'write_file', { file_path: 'unused-exports-report.md', content: '...' }, 'ok', false)
      expect(state.reportWritten).toBe(true)
      expect(state.reportPath).toBe('unused-exports-report.md')
      expect(state.phase).toBe('finalizing')
    })

    it('marks readBackDone when reading report after writing', () => {
      const state = createTaskState('analysis_report')
      // Write report
      updateTaskState(state, 'write_file', { file_path: 'report.md', content: '...' }, 'ok', false)
      expect(state.readBackDone).toBe(false)
      // Read it back
      updateTaskState(state, 'read_file', { file_path: 'report.md' }, '...content...', false)
      expect(state.readBackDone).toBe(true)
    })

    it('marks readBackDone when reading the edited file after editing', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'edit_file', { file_path: 'src/foo.ts', old_text: 'a', new_text: 'b' }, 'ok', false)
      updateTaskState(state, 'read_file', { file_path: 'src/foo.ts' }, '...content...', false)
      expect(state.readBackDone).toBe(true)
    })

    it('does NOT mark readBackDone when reading unrelated file after editing', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'edit_file', { file_path: 'src/foo.ts', old_text: 'a', new_text: 'b' }, 'ok', false)
      updateTaskState(state, 'read_file', { file_path: 'src/bar.ts' }, '...content...', false)
      expect(state.readBackDone).toBe(false)
    })

    it('detects verification commands in bash', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'bash', { command: 'pnpm -F @proj-airi/stage-ui exec vitest run' }, '{"exitCode": 0}', false)
      expect(state.verificationAttempted).toBe(true)
      expect(state.verificationPassed).toBe(true)
      expect(state.phase).toBe('verifying')
    })

    it('detects failed verification', () => {
      const state = createTaskState('existing_file_edit')
      updateTaskState(state, 'bash', { command: 'npm run test' }, '{"exitCode": 1}', false)
      expect(state.verificationAttempted).toBe(true)
      expect(state.verificationPassed).toBe(false)
    })

    it('does not advance on search_text or list_files', () => {
      const state = createTaskState('general_fix')
      updateTaskState(state, 'search_text', { query: 'foo' }, '...results...', false)
      expect(state.phase).toBe('exploring')
      updateTaskState(state, 'list_files', { pattern: '**/*.ts' }, '...files...', false)
      expect(state.phase).toBe('exploring')
    })
  })
})
