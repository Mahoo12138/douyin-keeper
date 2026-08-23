# TinyShip Permission Control System

This is a permission control system based on CASL for controlling user access to different resources in TinyShip applications. Supports Next.js, Nuxt.js, and TanStack Start applications.

## 🏗️ Design Philosophy

The permission system is based on the following core concepts:

1. **Roles**: Define user identities in the system
   - `normal`: Normal user (default role) *【Currently unused, reserved for extension】*
   - `vip`: VIP user (paid user) *【Currently unused, reserved for extension】*
   - `admin`: Administrator (super permissions) *【✅ Currently used: Admin backend access】*
   - `user`: Standard user *【✅ Currently used: Default database role】*

2. **Subjects**: Define entities that can be operated in the system
   - `user`: User management *【Reserved for extension】*
   - `project`: Project management *【Reserved for extension】*
   - `subscription`: Subscription management *【Reserved for extension】*
   - `report`: Report functionality *【Reserved for extension】*
   - `setting`: System settings *【Reserved for extension】*
   - `all`: All resources *【✅ Currently used: Admin access control】*

3. **Actions**: Define actions users can perform on resources
   - `create`: Create resource *【Reserved for extension】*
   - `read`: Read resource *【Reserved for extension】*
   - `update`: Update resource *【Reserved for extension】*
   - `delete`: Delete resource *【Reserved for extension】*
   - `manage`: Manage all operations *【✅ Currently used: Admin permission check】*

4. **Rules**: Define relationships between roles, resources, and actions through CASL

## 🚨 Current Usage Status

**Main permission control scenarios currently used in the system:**

1. **Admin Backend Access Control**
   - Routes: `/admin/*` (Next.js) and `/admin/*` (Nuxt.js)
   - Permission check: `can(user, Action.MANAGE, Subject.ALL)`
   - Only `admin` role users can access

2. **User Role System**
   - Database roles: `admin` | `user` (defined in `libs/database/constants.ts`)
   - Permission system role mapping: `admin` → `Role.ADMIN`, others → `Role.NORMAL`

3. **Subscription Feature Permissions**
   - Some features require valid subscription to access (e.g., premium-features page)
   - Controlled by subscription middleware, not permission system

**Other roles and resources are currently reserved for extension and can be configured based on business needs.**

## 📦 System Components

The permission system contains the following core components:

- **types.ts**: Role, resource, and action type definitions
- **abilities.ts**: CASL-based permission rule definitions
- **utils.ts**: Core permission check functions (`can`, `createAppUser`)
- **Vue Composables**: Permission check composable functions for Nuxt.js applications
- **PermissionGuard**: Vue component-level permission protection

## 💡 Basic Usage

### Current System Actual Usage Examples

```typescript
import { can, Action, Subject, createAppUser } from '@libs/permissions';

// Current main use case: Admin backend access control
const user = createAppUser(sessionUser); // Create AppUser from session user
const canAccessAdmin = can(user, Action.MANAGE, Subject.ALL); // Only admin role returns true

// Actual usage in middleware
const hasPermission = can(appUser, Action.MANAGE, Subject.ALL);
if (!hasPermission) {
  // Deny admin backend access
  return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
}
```

### Extended Permission Check Examples

```typescript
// The following are extended usage examples, currently not enabled
const hasPermission = can(user, Action.UPDATE, Subject.PROJECT);
const canEditProfile = can(user, Action.UPDATE, Subject.USER, { id: user.id });
```

### Actual Application Permission Checks

```typescript
// Current system actual usage (Next.js middleware)
import { can, Action, Subject, createAppUser } from '@libs/permissions';

// Check admin permissions in route middleware
const appUser = createAppUser(session?.user);
const hasPermission = can(appUser, Action.MANAGE, Subject.ALL);

if (!hasPermission) {
  return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
}

// Usage in Nuxt.js middleware
const appUser = createAppUser(user);
const hasPermission = can(appUser, Action.MANAGE, Subject.ALL);

if (!hasPermission) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions'
  });
}
```


## 🧪 Permission Rules

### Current Actual Permission Matrix

| Role | Admin Backend Access | Other Resources | Description |
|------|---------------------|-----------------|-------------|
| **admin** | ✅ Full access | *Reserved for extension* | Admin can access all management features |
| **user** (default) | ❌ Access denied | *Reserved for extension* | Regular users have no admin permissions |

### Extended Permission Matrix (Demo)

*The following is a complete permission system demo configuration that can be enabled based on business needs:*

| Role/Action | User | Project | Subscription | Report | Setting |
|-------------|------|---------|--------------|--------|---------|
| **NORMAL** | R, U (self) | R, C | - | R | - |
| **VIP** | R, U (self) | R, C, U | R | R, C | R |
| **ADMIN** | All permissions | All permissions | All permissions | All permissions | All permissions |

*Note: R=Read, C=Create, U=Update, D=Delete*

### Current Permission Logic

```typescript
// Current actual permission checks
const user = createAppUser(sessionUser);

// Admin backend access control (✅ Currently used)
can(user, Action.MANAGE, Subject.ALL) // Only admin role returns true

// Role checks (✅ Currently used)
const isAdmin = user.role === 'admin';
const isVip = userValue?.role === 'vip' || userValue?.role === 'admin';
```

### Extended Permission Logic (Demo)

*The following is a complete permission system demo configuration:*

```typescript
// User can only edit their own information (reserved for extension)
can(user, Action.UPDATE, Subject.USER, { id: user.id }) // ✅ Allow
can(user, Action.UPDATE, Subject.USER, { id: 'other-user-id' }) // ❌ Deny (non-admin)

// VIP users have additional permissions (reserved for extension)
can(vipUser, Action.CREATE, Subject.REPORT) // ✅ Allow
can(normalUser, Action.CREATE, Subject.REPORT) // ❌ Deny
```


## 📈 Extending the Permission System

**To extend permission functionality, you can:**

1. **Add new roles**: Define in `types.ts`, set permission rules in `abilities.ts`
2. **Add new resources**: Add to the `Subject` enum in `types.ts`
3. **Customize permission logic**: Add special handling in the `can` function in `utils.ts`

The current system is designed to be simple and flexible, and can be gradually extended based on business needs.

