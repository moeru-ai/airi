<template>
  <Story
    title="Sans"
    group="typography"
    :layout="{ type: 'grid', width: 500 }"
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
          <div font-jura bg="red-100" w-fit>
            こんにちは、世界！
          </div>
          <div font-jura bg="red-100" w-fit>
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
          <div font-quicksand bg="red-100" w-fit>
            こんにちは、世界！
          </div>
          <div font-quicksand bg="red-100" w-fit>
            你好，世界！
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
