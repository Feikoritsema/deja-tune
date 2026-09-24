import './lib/styles/tokens.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { store, boot } from './lib/store.svelte';

boot();

// Test hook: e2e specs read the live engine singleton through this (Vite dev serves
// a second module instance for bare dynamic imports, so window handles are the
// reliable bridge). Exposed only in dev to avoid leaking game state in prod.
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__dejaTuneStore = store;
}

const target = document.getElementById('app');
if (target) mount(App, { target });