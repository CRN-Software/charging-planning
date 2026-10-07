import type { Me } from '@charging/contracts';

/** The signed-in person, or null. On the server the browser's cookie is forwarded to the API. */
export const useMe = () => {
  const headers = useRequestHeaders(['cookie']);
  return useAsyncData('me', () => $fetch<Me>('/api/me', { headers }).catch(() => null));
};
