interface ExpectTypeChain {
  [key: string]: any
}

function createExpectTypeChain(): ExpectTypeChain {
  const fn = () => true
  const chain: ExpectTypeChain = {
    toBeAny: fn,
    toBeUnknown: fn,
    toBeNever: fn,
    toBeFunction: fn,
    toBeObject: fn,
    toBeArray: fn,
    toBeString: fn,
    toBeNumber: fn,
    toBeBoolean: fn,
    toBeVoid: fn,
    toBeSymbol: fn,
    toBeNull: fn,
    toBeUndefined: fn,
    toBeNullable: fn,
    toBeBigInt: fn,
    toMatchTypeOf: fn,
    toEqualTypeOf: fn,
    toBeConstructibleWith: fn,
    toMatchObjectType: fn,
    toExtend: fn,
  }

  const nested = [
    'parameters',
    'returns',
    'resolves',
    'not',
    'items',
    'constructorParameters',
    'thisParameter',
    'instance',
    'guards',
    'asserts',
    'branded',
    'map',
    'toBeCallableWith',
    'extract',
    'exclude',
    'pick',
    'omit',
    'toHaveProperty',
    'parameter',
  ]

  for (const key of nested) {
    Object.defineProperty(chain, key, {
      configurable: true,
      enumerable: true,
      get: () => expectTypeOf({}),
    })
  }

  return chain
}

export function expectTypeOf(_actual?: unknown): ExpectTypeChain {
  return createExpectTypeChain()
}

export default {
  expectTypeOf,
}
