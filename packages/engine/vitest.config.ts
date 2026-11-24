import { defineConfig } from "vitest/config";

// Property tests run hundreds of random order flows; give them room when every package tests in parallel.
export default defineConfig({ test: { testTimeout: 30_000 } });
