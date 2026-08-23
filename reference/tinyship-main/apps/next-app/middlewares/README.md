# Middleware Functions

This directory contains individual middleware functions used by the main `src/middleware.ts` file to handle specific request processing tasks before the request reaches the page or API route handler.

## Files

### `localeMiddleware.ts`

*   **Purpose:** Handles internationalization (i18n) logic, specifically detecting the user's preferred locale and ensuring the URL path includes a supported locale prefix (e.g., `/en`, `/fr`).
*   **Functionality:**
    1.  Checks if the incoming request path *already* has a supported locale prefix.
    2.  Checks if the request path is for an API route (`/api/...`). API routes are skipped as they typically don't require locale prefixes.
    3.  If a locale prefix is missing (and it's not an API route), it determines the best locale based on `Accept-Language` headers and cookies.
    4.  Redirects the user to the same path but with the appropriate locale prefix added (e.g., `/products` becomes `/en/products`).
    5.  If a locale prefix exists or it's an API route, it allows the request to proceed to the next middleware.

### `authMiddleware.ts`

*   **Purpose:** Handles authentication and *general* authorization checks for protected routes defined within the file.
*   **Functionality:**
    1.  Defines a `protectedRoutes` configuration array. Each entry specifies:
        *   A `pattern` (RegExp) to match URL paths.
        *   The `type` of route (`page` or `api`) to determine the response on failure.
        *   Optional `requiredPermission` ({ action, subject }) based on the `@libs/permissions` library for basic role/ability checks.
    2.  Checks if the incoming request path matches any defined `pattern`.
    3.  If it matches a protected route:
        *   **Authentication:** Verifies if a valid user session exists using `@libs/auth`. If not, it redirects `page` types to login or returns `401 Unauthorized` for `api` types.
        *   **Authorization (General):** If authentication succeeds and `requiredPermission` is defined for the route, it checks if the authenticated user has the necessary general permission using `can(user, action, subject)` from `@libs/permissions`. If the check fails, it returns `403 Forbidden`.
    4.  If the route is not protected, or if authentication and authorization checks pass, it allows the request to proceed.

*   **Important Note (Two-Layer Authorization):** This middleware performs the *first layer* of authorization (general capability). **Instance-specific** checks (e.g., "can this user edit *this specific* article?") must be performed in the *second layer*, within the relevant API route handler or `getServerSideProps`, after fetching the specific resource data. See the comments at the end of `authMiddleware.ts` for a pseudo-code example.

## Orchestration

These individual middleware functions are imported and called sequentially by the main `src/middleware.ts` file. The main file also handles skipping middleware execution for static assets (`_next`, `images`, files with extensions) and defines the overall `matcher` config for Next.js. 