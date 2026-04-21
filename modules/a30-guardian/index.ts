// Reexport the native module. On web, it will be resolved to A30GuardianModule.web.ts
// and on native platforms to A30GuardianModule.ts
export { default } from './src/A30GuardianModule';
export { default as A30GuardianView } from './src/A30GuardianView';
export * from  './src/A30Guardian.types';
