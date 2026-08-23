import { auth, toNextJsHandler } from "@libs/auth";
 
export const { GET, POST } = toNextJsHandler(auth.handler);
