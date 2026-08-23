import { auth } from '@libs/auth'

export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event));
});

