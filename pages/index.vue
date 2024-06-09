<template>
  <div>
    <Suspense>
      <ClientOnly>
        <MainStage />
      </ClientOnly>
      <template #fallback>
        <div italic op50>
          <span animate-pulse>Loading...</span>
        </div>
      </template>
    </Suspense>
  </div>
</template>
