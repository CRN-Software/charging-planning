import withNuxt from './.nuxt/eslint.config.mjs';
import { base } from '@charging/tooling/eslint';

// The shared base is type-aware and would clobber the vue parser: scope every entry
// (except the global ignores) to plain TS/JS files; .vue files keep the @nuxt/eslint
// setup plus the size rules below.
const scoped = base.map((config) =>
  config.files || config.ignores
    ? config
    : { ...config, files: ['**/*.ts', '**/*.mts', '**/*.js', '**/*.mjs'] },
);

export default withNuxt(...scoped, {
  files: ['**/*.vue'],
  rules: {
    // Prettier writes void elements self-closed; align the vue rule with it.
    'vue/html-self-closing': ['warn', { html: { void: 'always' } }],
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 35, skipBlankLines: true, skipComments: true }],
  },
});
