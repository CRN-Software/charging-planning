// One public port per application: the web server relays the API routes to the API container.
// Redirects (OAuth) go back to the browser untouched instead of being followed here.
const API_PREFIXES = ['/api/', '/.well-known/appspecific/'];

export default defineEventHandler((event) => {
  if (!API_PREFIXES.some((prefix) => event.path.startsWith(prefix))) return;
  const { apiInternalUrl } = useRuntimeConfig();
  return proxyRequest(event, `${apiInternalUrl}${event.path}`, { fetchOptions: { redirect: 'manual' } });
});
