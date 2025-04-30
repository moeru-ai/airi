<template>
  <Story
    title="Typography Sans"
    group="design-system"
    :layout="{ type: 'grid', width: 200 }"
  >
    <Variant title="Sans">
      <div>
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
      <div>
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
      <div>
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
      <div>
        <div flex flex-col gap-1>
          <div font-cuteen>
            Hello, world!
          </div>
          <div font-cute>
            こんにちは、世界！
          </div>
          <div font-cute>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Jura Sans">
      <div>
        <div flex flex-col gap-1>
          <div font-jura>
            Hello, world!
          </div>
          <div bg="red-100 dark:red-900" w-fit font-jura>
            こんにちは、世界！
          </div>
          <div bg="red-100 dark:red-900" w-fit font-jura>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>

    <Variant title="Tech Sans">
      <div>
        <div flex flex-col gap-1>
          <div font-quicksand>
            Hello, world!
          </div>
          <div bg="red-100 dark:red-900" w-fit font-quicksand>
            こんにちは、世界！
          </div>
          <div bg="red-100 dark:red-900" w-fit font-quicksand>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
