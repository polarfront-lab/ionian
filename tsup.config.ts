import {defineConfig} from "tsup";

export default defineConfig({
    entry: ["src/index.ts"], // Entry point of your library
    format: ["esm", "cjs"], // Generate both ESM and CJS modules
    splitting: false, // Splitting is not needed for small libraries
    sourcemap: true, // Source maps are useful for debugging
    clean: true, // Clean the output directory before building
    dts: true, // Generate type declaration files
    minify: true, // Minify the output for production
    target: "es2020", // Target ES2020 for better compatibility
    external: ["three", "three-stdlib"], // External dependencies that should not be bundled
})