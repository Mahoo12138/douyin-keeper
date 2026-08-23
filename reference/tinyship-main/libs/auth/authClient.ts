import { createAuthClient as createAuthClientVue } from "better-auth/vue"
import { createAuthClient as createAuthClientReact } from "better-auth/react"
import { genericOAuthClient, adminClient, phoneNumberClient  } from "better-auth/client/plugins"

const plugins = [
  genericOAuthClient(),
  adminClient(),
  phoneNumberClient()
]

export const authClientVue = createAuthClientVue({
  plugins
})

export const authClientReact = createAuthClientReact({
  plugins
})
