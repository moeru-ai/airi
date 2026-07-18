<template>
  <Story
    title="Typography Sans"
    group="design-system"
    :layout="{ type: 'grid', width: 350 }"
  >
    <Variant title="Sans">
      <div flex flex-col gap-1>
        <div mb-3 text-4xl font-bold tracking-wide font-sans>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-sans>
            Hello, world!
          </div>
          <div font-sans>
            こんにちは、世界！
          </div>
          <div font-sans>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Quanlai Sans">
      <div flex flex-col gap-1>
        <div font-quanlai mb-3 text-4xl font-bold tracking-wide>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-quanlai>
            Hello, world!
          </div>
          <div font-quanlai>
            こんにちは、世界！
          </div>
          <div font-quanlai>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Xiaolai Sans">
      <div flex flex-col gap-1>
        <div font-xiaolai mb-3 text-4xl font-bold tracking-wide>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-xiaolai>
            Hello, world!
          </div>
          <div font-xiaolai>
            こんにちは、世界！
          </div>
          <div font-xiaolai>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Cute Sans">
      <div flex flex-col gap-1>
        <div mb-3 text-4xl font-bold tracking-wide font-cuteen>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-cuteen>
            Hello, world!
          </div>
          <div font-cutejp>
            こんにちは、世界！
          </div>
          <div font-cutejp>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Jura Sans">
      <div flex flex-col gap-1>
        <div font-jura mb-3 text-4xl font-bold tracking-wide>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-jura>
            Hello, world!
          </div>
          <div bg="red-100 dark:red-900" font-jura w-fit>
            こんにちは、世界！
          </div>
          <div bg="red-100 dark:red-900" font-jura w-fit>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Tech Sans">
      <div flex flex-col gap-1>
        <div font-quicksand mb-3 text-4xl font-bold tracking-wide>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-quicksand>
            Hello, world!
          </div>
          <div bg="red-100 dark:red-900" font-quicksand w-fit>
            こんにちは、世界！
          </div>
          <div bg="red-100 dark:red-900" font-quicksand w-fit>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Urbanist">
      <div flex flex-col gap-1>
        <div font-urbanist mb-3 text-4xl font-bold tracking-wide>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-urbanist>
            Hello, world!
          </div>
          <div bg="red-100 dark:red-900" font-quicksand w-fit>
            こんにちは、世界！
          </div>
          <div bg="red-100 dark:red-900" font-quicksand w-fit>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="M PLUS Rounded 1c">
      <div flex flex-col gap-1>
        <div font-m-plus-rounded mb-3 text-4xl font-bold tracking-wide>
          <span text="neutral-500 dark:neutral-400">Project</span> <span text-pink>AIRI</span>
        </div>
        <div flex flex-col gap-1>
          <div font-m-plus-rounded>
            Hello, world!
          </div>
          <div font-m-plus-rounded>
            こんにちは、世界！
          </div>
          <div font-m-plus-rounded>
            <span bg="red-100 dark:red-900">你</span>好，世界！
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
