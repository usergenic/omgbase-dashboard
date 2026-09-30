import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { nomicShikiLanguage } from "@simplebrains/nomic-syntax";

export default defineConfig({
  // Static by default; API routes set `prerender = false` for on-demand.
  output: "static",
  adapter: node({ mode: "standalone" }),
  markdown: {
    shikiConfig: {
      langs: [nomicShikiLanguage],
    },
  },
});
