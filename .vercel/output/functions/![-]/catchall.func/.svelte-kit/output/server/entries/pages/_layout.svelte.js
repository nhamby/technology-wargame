import { c as create_ssr_component } from "../../chunks/ssr.js";
const css = {
  code: "body{margin:0;padding:0;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;background:#2d2d30;min-height:100vh}",
  map: `{"version":3,"file":"+layout.svelte","sources":["+layout.svelte"],"sourcesContent":["<script lang=\\"ts\\">export let data = void 0;\\n$: _ = data;\\n<\/script>\\n\\n<slot />\\n\\n<style>\\n\\t:global(body) {\\n\\t\\tmargin: 0;\\n\\t\\tpadding: 0;\\n\\t\\tfont-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\\n\\t\\tbackground: #2d2d30;\\n\\t\\tmin-height: 100vh;\\n\\t}\\n</style>\\n"],"names":[],"mappings":"AAOS,IAAM,CACb,MAAM,CAAE,CAAC,CACT,OAAO,CAAE,CAAC,CACV,WAAW,CAAE,aAAa,CAAC,CAAC,kBAAkB,CAAC,CAAC,UAAU,CAAC,CAAC,MAAM,CAAC,CAAC,UAAU,CAC9E,UAAU,CAAE,OAAO,CACnB,UAAU,CAAE,KACb"}`
};
const Layout = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { data = void 0 } = $$props;
  if ($$props.data === void 0 && $$bindings.data && data !== void 0) $$bindings.data(data);
  $$result.css.add(css);
  return `${slots.default ? slots.default({}) : ``}`;
});
export {
  Layout as default
};
