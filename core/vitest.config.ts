import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
	test: {
		name: "core",
		root: path.resolve(__dirname, ".."),
	},
})
