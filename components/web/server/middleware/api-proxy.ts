// One public port per application: the web server relays the API routes to the API container.
const API_PREFIXES = ['/api/', '/.well-known/appspecific/'];

export default defineEventHandler((event) => {
  if (!API_PREFIXES.some((prefix) => event.path.startsWith(prefix))) return;
  const { apiInternalUrl } = useRuntimeConfig();
  return proxyRequest(event, `${apiInternalUrl}${event.path}`);
});
