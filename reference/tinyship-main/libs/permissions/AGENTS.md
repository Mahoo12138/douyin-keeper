# AGENTS.md

## Overview

CASL-based permissions system for access control across Next.js, Nuxt.js, and TanStack Start applications. Currently focused on admin access control with roles (`admin`/`user`) and extensible design for future resource-level permissions.

## Setup Commands

```bash
# No installation needed - pure TypeScript library

# Import permission functions
import { can, Action, Subject, createAppUser } from '@libs/permissions'

# Available components (current usage)
# - Admin backend access control (/admin/* routes)
# - Role-based access with database integration
```

## Code Style

- CASL-based permission rules with TypeScript enums
- Factory function: `createAppUser(sessionUser)` for user normalization  
- Simple permission check: `can(user, action, subject, resource?)`
- Role mapping: database roles → permission system roles
- Middleware integration for route protection
- Extensible design for future features

## Usage Examples

### Current Admin Access Control

```typescript
import { can, Action, Subject, createAppUser } from '@libs/permissions';

// Convert session user to AppUser
const appUser = createAppUser(sessionUser);

// Check admin access (main current usage)
const canAccessAdmin = can(appUser, Action.MANAGE, Subject.ALL);
// Returns true only for admin role

if (!canAccessAdmin) {
  return Response.json({ error: 'Access denied' }, { status: 403 });
}
```

### Next.js Middleware Integration

```typescript
// middlewares/authMiddleware.ts
import { can, Action, Subject, createAppUser } from '@libs/permissions';

export async function authMiddleware(request: NextRequest) {
  const session = await getSession();
  
  // Admin route protection
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const appUser = createAppUser(session?.user);
    const hasPermission = can(appUser, Action.MANAGE, Subject.ALL);
    
    if (!hasPermission) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }
  }
}
```

### Nuxt.js Middleware Integration

```typescript
// middleware/auth.global.ts
import { can, Action, Subject, createAppUser } from '@libs/permissions';

export default defineNuxtRouteMiddleware(async (to) => {
  // Admin route protection
  if (to.path.startsWith('/admin')) {
    const { user } = await getUserSession();
    const appUser = createAppUser(user);
    const hasPermission = can(appUser, Action.MANAGE, Subject.ALL);
    
    if (!hasPermission) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Access denied'
      });
    }
  }
});
```

### Role Checking

```typescript
// Current role system
const appUser = createAppUser(sessionUser);

// Direct role access
const isAdmin = appUser.role === 'admin';
const isUser = appUser.role === 'user';

// VIP check (includes admin)
const isVip = appUser.role === 'vip' || appUser.role === 'admin';
```

## Common Tasks

### Current Permission Matrix

| Role | Admin Backend | Other Resources |
|------|---------------|-----------------|
| **admin** | ✅ Full access | *Reserved for extension* |
| **user** (default) | ❌ Denied | *Reserved for extension* |

### Available Roles

```typescript
enum Role {
  NORMAL = 'normal',  // Default role (currently unused)
  VIP = 'vip',        // Premium users (reserved for extension)
  ADMIN = 'admin',    // Administrators (currently active)
  USER = 'user'       // Standard users (currently active)
}
```

### Available Actions & Subjects

```typescript
enum Action {
  CREATE = 'create',  // Reserved for extension
  READ = 'read',      // Reserved for extension  
  UPDATE = 'update',  // Reserved for extension
  DELETE = 'delete',  // Reserved for extension
  MANAGE = 'manage'   // Currently used for admin access
}

enum Subject {
  USER = 'user',           // Reserved for extension
  PROJECT = 'project',     // Reserved for extension
  SUBSCRIPTION = 'subscription', // Reserved for extension
  REPORT = 'report',       // Reserved for extension
  SETTING = 'setting',     // Reserved for extension
  ALL = 'all'             // Currently used for admin access
}
```

### Extend Permission System

```typescript
// Add new permission rules in abilities.ts
import { AbilityBuilder } from '@casl/ability';

const rules = (user: AppUser) => {
  const { can, cannot, build } = new AbilityBuilder(AppAbility);
  
  // Current admin rule
  if (user.role === 'admin') {
    can(Action.MANAGE, Subject.ALL);
  }
  
  // Add new rules for extensions
  if (user.role === 'vip') {
    can(Action.CREATE, Subject.REPORT);
    can(Action.READ, Subject.REPORT);
  }
  
  return build();
};
```

## Testing Instructions

```bash
# Test permission logic
# 1. Create test users with different roles
# 2. Verify admin can access /admin routes
# 3. Verify regular users cannot access /admin routes
# 4. Test createAppUser function with various inputs

# Integration testing
# 1. Test middleware integration in both frameworks
# 2. Verify error responses for denied access
# 3. Test role checking functions work correctly
```

## Troubleshooting

### Permission Denied Issues
- Verify user has correct role in database (`admin` vs `user`)
- Check `createAppUser` function maps roles correctly
- Ensure session contains valid user data

### Middleware Not Working
- Confirm middleware is properly imported and configured
- Check route patterns match protected paths (`/admin/*`)
- Verify permission check uses correct action/subject combination

### Role Mapping Problems
- Database role should be `admin` or `user`
- Permission system maps `admin` → `Role.ADMIN`, others → `Role.NORMAL`
- Check database constants match permission system roles

## Architecture Notes

- **Current Focus**: Admin access control for backend routes
- **Permission Logic**: Simple role-based system with admin/user distinction
- **Framework Support**: Next.js, Nuxt.js, and TanStack Start middleware/guard integration
- **Extensibility**: Designed for future resource-level permissions
- **Database Integration**: Maps database roles to permission system roles
- **CASL Foundation**: Built on CASL for complex permission scenarios
- **Route Protection**: Primary use case is protecting `/admin/*` routes
- **Future Expansion**: Supports VIP roles, resource-specific permissions, and fine-grained access control
