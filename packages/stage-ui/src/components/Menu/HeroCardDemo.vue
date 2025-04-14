<script setup lang="ts">
</script>

<template>
  <div flex="1 ~ items-center justify-center" h-full w-full bg-gray-500>
    <div h-180 w-100 rounded>
      <div h-full flex>
        <div flex="1 ~ col" h-full bg="[#1f1f1f]">
          <div flex="1 ~ col" relative>
            <div z-1 flex-1 bg-blue-300>
              <span text-5xl>BG</span>
            </div>
            <div z-3 ml--10 py-2>
              <div>
                <span text-lg>subtitle</span>
              </div>
              <div>
                <span text-5xl>Title</span>
              </div>
            </div>
            <div absolute bottom-0 left--10 right-0 top--10 z-2 bg-blue-500:50>
              <span text-5xl>Cover</span>
            </div>
          </div>
          <div mx-10 h-1 bg-gray-500 />
          <div px-10 py2>
            <div>
              <span text-2xl>Info 1111</span>
            </div>
            <div>
              <span text-2xl>Info 2222</span>
            </div>
          </div>
        </div>
        <div h-full w-15 bg-pink-500>
          <span text-5xl>R</span>
        </div>
      </div>
    </div>
  </div>
</template>
