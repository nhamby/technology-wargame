

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.fYULgxm-.js","_app/immutable/chunks/HYagArB5.js","_app/immutable/chunks/DFvcoiM4.js","_app/immutable/chunks/d6WERGuC.js"];
export const stylesheets = [];
export const fonts = [];
