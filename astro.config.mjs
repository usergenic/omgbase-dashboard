import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import { nomicShikiLanguage } from "@simplebrains/nomic-syntax";

export default defineConfig({
  // Everything renders at request time from omg live collections.
  output: "server",
  adapter: node({ mode: "standalone" }),
  markdown: {
    shikiConfig: {
      langs: [nomicShikiLanguage],
    },
  },
});
