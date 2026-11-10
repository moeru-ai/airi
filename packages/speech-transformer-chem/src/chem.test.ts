import { describe, expect, it } from 'vitest'

import { lowerChemistry } from './chem'

describe('lowerChemistry', () => {
  it('rebuilds species from the TeX of mhchemParser', () => {
    expect(lowerChemistry('2H2 + O2 -> 2H2O')).toEqual(['Chemistry', ['Reaction', '\'->\'', ['Side', ['Species', '\'H2\'', { num: '2' }, 'Nothing'], ['Species', '\'O2\'', 'Nothing', 'Nothing']], ['Side', ['Species', '\'H2O\'', { num: '2' }, 'Nothing']], 'Nothing']])
    expect(lowerChemistry('Ca(OH)2')).toEqual(['Chemistry', ['Side', ['Species', '\'Ca(OH)2\'', 'Nothing', 'Nothing']]])
    expect(lowerChemistry('SO4^2-')).toEqual(['Chemistry', ['Side', ['Species', '\'SO4^2-\'', 'Nothing', 'Nothing']]])
  })

  it('keeps states, hydrates, gas, precipitates, and arrow conditions', () => {
    expect(lowerChemistry('H2O(l)')).toEqual(['Chemistry', ['Side', ['Species', '\'H2O\'', 'Nothing', '\'l\'']]])
    expect(lowerChemistry('CuSO4*5H2O')).toEqual(['Chemistry', ['Side', ['Hydrate', ['Species', '\'CuSO4\'', 'Nothing', 'Nothing'], ['Species', '\'H2O\'', { num: '5' }, 'Nothing']]]])
    expect(lowerChemistry('AgCl v')).toEqual(['Chemistry', ['Side', ['Precipitate', ['Species', '\'AgCl\'', 'Nothing', 'Nothing']]]])
    expect(lowerChemistry('CaCO3 ->[\\Delta] CaO + CO2 ^')).toMatchObject(['Chemistry', ['Reaction', '\'->\'', expect.anything(), ['Side', expect.anything(), ['Gas', expect.anything()]], ['Heat']]])
    const [, reaction] = lowerChemistry('N2 + 3H2 <=> 2NH3') as [string, [string, string]]
    expect(reaction[1]).toBe('\'<=>\'')
  })
})
