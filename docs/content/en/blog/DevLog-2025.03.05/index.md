---
title: DevLog @ 2025.03.05
category: DevLog
date: 2025-03-05
---


## Deja Vu


Yesterday I added a new package called [`gpuu` (GPU utilities)](https://github.com/moeru-ai/gpuu),


to help us handle WebGPU-related features, and perhaps in the future use it to interact with real GPU devices.


The package is still fairly limited at the moment; we will add more capabilities in upcoming versions.


Here is how to use it:

```ts
import { check } from 'gpuu/webgpu'
import { onMounted } from 'vue'

onMounted(async () => {
  const result = await check()

  console.info(result)

  // Do something with the result
})
```


Last week, our corporate designer/artist submitted the first draft of the Project AIRI logo.


The overall style of the logo looked like this:


![](/blog/DevLog-2025.03.05/assets/airi-logos-v1.avif)


## Daytime Work


From a design perspective, these logos were too complex and not friendly enough when scaled down to a main-screen app size.


So I redesigned this version:


![](/blog/DevLog-2025.03.05/assets/airi-logo-v2.avif)


And edited other variants:


![](/blog/DevLog-2025.03.05/assets/airi-logos-v2.avif)


However, these versions only suit the dark theme. "We also need a light theme version!" With that in mind, I immediately set out to make this:


![](/blog/DevLog-2025.03.05/assets/airi-logo-v2-dark.avif)


[@kwaa](https://github.com/kwaa) suggested we could try swapping the color schemes for both themes:


![](/blog/DevLog-2025.03.05/assets/airi-logos-v3.avif)


It really does look better.


We also updated the typography:


![](/blog/DevLog-2025.03.05/assets/airi-logos-v4.avif)


And refined the background colors:


![](/blog/DevLog-2025.03.05/assets/airi-logos-v5.avif)


So this is what we ended up with:


![](/blog/DevLog-2025.03.05/assets/airi-logos-final.avif)


Later today, I officially launched the Project AIRI [documentation website](https://airi.build),


providing references and guides for myself and other developers and artists.


Finally done! The newly designed logo and color schemes have been integrated into the [documentation website](https://airi.build):


![](/blog/DevLog-2025.03.05/assets/airi-build-light.avif)


![](/blog/DevLog-2025.03.05/assets/airi-build-dark.avif)


The website now includes the [basic guides](../guides/),


the [contribution guide](../references/contributing/guide/),


and the [design guidelines](../references/design-guidelines/).


I spent the entire noon studying the text-PV animation effects on YouTube,


and I am fascinated by these animations, hoping to implement similar transitions in the browser!


https://www.youtube.com/watch?v=_AIgv0EsOE4


Fortunately, I know a developer and artist who is excellent in this area:


[yui540](https://github.com/yui540) (personal site: [yui540.com](https://yui540.com)),


who just released a brand new repository showcasing those wonderful transition implementations.


I have added these related resources and website links to [https://airi.build](https://airi.build) — feel free to check them out.


## Dev Stream


I ported many of the animation transitions from the [yui540](https://github.com/yui540) [repository](https://github.com/yui540/css-animations) to [https://proj-airi-packages-ui-transitions.netlify.app/#/](https://proj-airi-packages-ui-transitions.netlify.app/#/).


The ported results look quite good:


![](/blog/DevLog-2025.03.05/assets/animation-transitions.gif)


That's it for today's DevLog. Thank you to everyone who joined the DevStream and stayed with us to the very end. See you tomorrow.

