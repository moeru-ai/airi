## Layouts

Vue components in this dir are used as layouts.

By default, `default.vue` will be used unless an alternative is specified in the route meta.

With [`unplugin-vue-router`](https://github.com/posva/unplugin-vue-router) and [`vite-plugin-vue-layouts`](https://github.com/JohnCampionJr/vite-plugin-vue-layouts), you can specify the layout in the page's SFCs like this:

```vue
<route lang="yaml">
meta:
  layout: home
</route>
```
