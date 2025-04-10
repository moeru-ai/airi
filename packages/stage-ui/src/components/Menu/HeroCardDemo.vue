<script setup lang="ts">
</script>

<template>
  <div flex="1 ~ items-center justify-center" bg-gray-500 h-full w-full>
    <div rounded h-180 w-100>
      <div flex h-full>
        <div flex="1 ~ col" h-full bg="[#1f1f1f]">
          <div flex="1 ~ col" relative>
            <div bg-blue-300 flex-1 z-1>
              <span text-5xl>BG</span>
            </div>
            <div ml--10 py-2 z-3>
              <div>
                <span text-lg>subtitle</span>
              </div>
              <div>
                <span text-5xl>Title</span>
              </div>
            </div>
            <div bg-blue-500:50 bottom-0 left--10 right-0 top--10 absolute z-2>
              <span text-5xl>Cover</span>
            </div>
          </div>
          <div mx-10 bg-gray-500 h-1 />
          <div px-10 py2>
            <div>
              <span text-2xl>Info 1111</span>
            </div>
            <div>
              <span text-2xl>Info 2222</span>
            </div>
          </div>
        </div>
        <div bg-pink-500 h-full w-15>
          <span text-5xl>R</span>
        </div>
      </div>
    </div>
  </div>
</template>
