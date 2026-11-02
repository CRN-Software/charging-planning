// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  ssr: true,
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@pinia/nuxt'],
  typescript: { strict: true, typeCheck: false },
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Charging Planner',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'application-name', content: 'Charging Planner' },
        { property: 'og:site_name', content: 'Charging Planner' },
      ],
    },
  },
  css: [
    '@fontsource-variable/bricolage-grotesque',
    '@fontsource-variable/figtree',
    '@fontsource-variable/jetbrains-mono',
    '@/assets/css/main.css',
  ],
  runtimeConfig: {
    // The API seen from the Nuxt server (SSR calls and the /api relay, server/middleware/api-proxy.ts).
    apiInternalUrl: 'http://localhost:6123',
    public: {
      baseUrl: 'http://localhost:5123',
    },
  },
  nitro: {
    preset: 'node-server',
  },
});
