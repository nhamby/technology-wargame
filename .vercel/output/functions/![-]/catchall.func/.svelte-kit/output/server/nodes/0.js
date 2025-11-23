

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export const imports = ["_app/immutable/nodes/0.BX79w10X.js","_app/immutable/chunks/HYagArB5.js","_app/immutable/chunks/DFvcoiM4.js"];
export const stylesheets = ["_app/immutable/assets/0.7OGqdet2.css"];
export const fonts = [];
