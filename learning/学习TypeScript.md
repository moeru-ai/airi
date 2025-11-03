# 快速上手：在本项目中学习 TypeScript（针对 Web 应用）

目标：帮助前端开发者在本仓库的 `apps/stage-web` 项目中用 TypeScript 快速上手并高效贡献代码。

适用范围：Vue 3 + Vite + TypeScript + Pinia + Vue Router 项目（本仓库使用的技术栈）。

---

## 一、准备与命令

- 安装依赖：

  ```powershell
  pnpm install
  ```

- 启动开发服务器：

  ```powershell
  pnpm run dev     # 在根目录通常会启动 stage-web
  pnpm -F @proj-airi/stage-web dev  # 只启动该子包
  ```

- 类型检查（工作区）：

  ```powershell
  pnpm run typecheck
  ```

- 运行 lint：

  ```powershell
  pnpm run lint
  pnpm run lint:fix
  ```

- 构建：

  ```powershell
  pnpm run build:web
  ```

---

## 二、VS Code 推荐设置与扩展

- 打开 `apps/stage-web` 或仓库根目录作为工作区。
- 推荐扩展：Volar、ESLint、Prettier、TypeScript Vue Plugin (Volar 已包含)、Pinia devtools。
- 启用 TypeScript 检查：设置 `volar.takeOverMode` 仅在需要时使用；推荐使用 `.vscode/settings.json` 指向项目 TypeScript（workspace version）。

---

## 三、项目中常见的 TypeScript 模式（示例来自 `apps/stage-web/src/main.ts`）

核心要点：

- 顶层使用 `import type` 导入仅用于类型的符号，防止额外的运行时开销。
- 在 Vue 应用中使用 `createApp(App).use(...)`，许多插件（例如 Pinia、router、i18n）会带有自己的类型定义。
- 将 `autoAnimatePlugin` 类型断言为 Vue `Plugin`：

  ```ts
  // TODO: Fix autoAnimatePlugin type error
  .use(autoAnimatePlugin as unknown as Plugin)
  ```

  这是一种临时解决方案。更好的方式是为该插件补充合适的类型声明（在 `types/` 下建立 `auto-animate.d.ts`），或升级插件以获得官方类型。

---

## 四、Vue + TypeScript 快速实践

1. SFC 推荐写法（Script setup）

   ```vue
   <script setup lang="ts">
   import type { Ref } from 'vue'

   import { computed, ref } from 'vue'

   const count = ref<number>(0)
   const double = computed(() => count.value * 2)
   </script>
   ```

2. Props 与 Emits

   ```vue
   <script setup lang="ts">
   interface Props { title?: string }
   const props = defineProps<Props>()

   const emit = defineEmits<{ (e: 'submit', payload: string): void }>()
   </script>
   ```

3. 组合式函数（composables）

   - 在 `src/composables/` 中编写可复用逻辑，导出带类型的函数。
   - 为返回值写好接口，便于调用方使用自动完成。

   ```ts
   export function useCounter(initial = 0) {
     const count = ref<number>(initial)
     function inc() { count.value++ }
     return { count, inc }
   }
   ```

4. Pinia Store 类型

   - 定义 Store 时使用返回值的类型推断：

   ```ts
   import { defineStore } from 'pinia'

   export const useUserStore = defineStore('user', () => {
     const name = ref<string | null>(null)
     function setName(n: string) { name.value = n }
     return { name, setName }
   })
   ```

   - 在组件中使用：

   ```ts
   const user = useUserStore()
   user.setName('alice')
   ```

5. Vue Router 类型

   - 路由创建在 `apps/stage-web/src/main.ts`、`virtual:generated-layouts` 与 `vue-router/auto-routes` 自动生成路由记录。
   - 在导航守卫中使用 `to: RouteLocationNormalized` 等类型以获得自动完成。

---

## 五、与后端/外部模块交互的类型

- 定义 API 返回类型（DTO）并在调用处使用：

  ```ts
  interface UserResponse { id: string, name: string }
  async function fetchUser(): Promise<UserResponse> { /* ... */ }
  ```

- 对第三方 JS 库没有类型时：
  - 首选安装类型包（`npm i -D @types/pkg` 或查看包是否自带 types）。
  - 若无类型，创建 `types/thirdparty.d.ts` 并声明模块：

    ```ts
    declare module '@some/legacy-lib'
    ```

---

## 六、常见错误与排查技巧

- "Cannot find module" / 类型未识别：确认 `tsconfig.json` 中 `paths` 与 `include` 是否覆盖你的代码位置，`pnpm install` 是否成功。
- 类型过宽：利用 `as const`、更严格的接口和泛型来缩小类型范围。
- 编译器报错但 VS Code 未更新：重启 TypeScript Server（Cmd/Ctrl+Shift+P -> TypeScript: Restart TS Server）或重启 VS Code。

---

## 七、如何在本项目安全提交 TypeScript 改动

1. 本仓库使用 pre-commit 钩子运行 lint 与 fix，请确保本地 `pnpm install` 完成。
2. 在提交前本地运行：

   ```powershell
   pnpm lint && pnpm run typecheck
   ```

3. 若钩子调用 oxlint/moeru-lint，确保 `pnpm -s exec oxlint --version` 可执行。

---

## 八、建议的学习路线（短期）

1. 熟悉 TypeScript 基础（类型、接口、联合、交叉、泛型） — 官方手册：https://www.typescriptlang.org/docs/
2. 学习 Vue 3 + TypeScript：使用 `<script setup lang="ts">` 模式（Vue 官方指南）。
3. 实践在本项目里：修改一个小组件、运行 `pnpm dev`、确保 `pnpm typecheck` 无误并提交 PR。

---

## 九、练手任务（基于本仓库）

1. 在 `apps/stage-web/src/components/` 新建一个 `HelloWorld` 组件，使用 `props` 与 `emit`，并在一处页面引入。
2. 在 `src/composables/useLocalStorage.ts` 实现一个带类型的本地存储 Hook。写单元测试（vitest）。
3. 为 `autoAnimatePlugin` 写一个简单的声明文件 `types/auto-animate.d.ts` 以移除 `as unknown as Plugin`。

---

补充资源：

- TypeScript Handbook: https://www.typescriptlang.org/docs/
- Vue + TypeScript Guide: https://vuejs.org/guide/typescript/overview.html
- Pinia: https://pinia.vuejs.org/
- Vue Router Types: https://router.vuejs.org/guide/advanced/typed-routes.html
