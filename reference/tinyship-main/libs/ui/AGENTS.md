# AGENTS.md

## Overview

TinyShip UI Library - A pure CSS design system built on shadcn/ui standards with multi-theme support and zero dependencies. Provides CSS variables, chart colors, gradients, and 5 color schemes for modern web applications.

## Setup Commands

```bash
# Import styles in your CSS file
# In globals.css or main.css:
@import "../../../libs/ui/styles/index.css";

# No additional installation needed - pure CSS
```

## Code Style

- Pure CSS with CSS variables following shadcn/ui conventions
- TypeScript utilities for theme management in `themes.ts`
- CSS class-based theme switching
- OKLCH color space for better color consistency
- Tailwind CSS utility integration

## Usage Examples

### Basic Theme Setup

```javascript
// Theme switching (framework agnostic)
document.documentElement.classList.add('dark')
document.documentElement.classList.add('theme-claude')

// Available themes: theme-claude, theme-cosmic-night, theme-modern-minimal, theme-ocean-breeze
```

### Next.js Integration

```css
/* app/globals.css */
@import "../../../libs/ui/styles/index.css";
```

```tsx
// Use standard shadcn/ui classes
<button className="bg-primary text-primary-foreground">Button</button>
<div className="bg-chart-1 text-chart-1-foreground">Chart Element</div>
```

### Nuxt.js Integration

```css
/* assets/css/main.css */
@import "../../../libs/ui/styles/index.css";
```

```vue
<template>
  <button class="bg-primary text-primary-foreground">Button</button>
  <div class="bg-gradient-chart-warm">Gradient Background</div>
</template>
```

## Common Tasks

### Add New Theme
1. Use [tweakcn.com theme generator](https://tweakcn.com/editor/theme) 
2. Export CSS variables
3. Create `libs/ui/styles/themes/mytheme.css` with `.theme-mytheme` class
4. Add gradients and transparency variants
5. Update `libs/ui/themes.ts` configuration

### Use Chart Colors
```css
/* 5 chart colors with transparency variants */
.bg-chart-1, .bg-chart-2, .bg-chart-3, .bg-chart-4, .bg-chart-5
.bg-chart-1-10, .bg-chart-1-15  /* 10%, 15% opacity */
```

### Apply Gradients
```css
.bg-gradient-chart-warm   /* Theme-aware warm gradient */
.bg-gradient-chart-cool   /* Theme-aware cool gradient */
.text-gradient-chart-warm /* Gradient text effect */
```

## Testing Instructions

```bash
# Test theme switching
# 1. Load application
# 2. Toggle between light/dark modes
# 3. Switch color schemes
# 4. Verify CSS variables are applied correctly

# Visual verification
# Check gradient backgrounds render properly
# Verify chart colors have sufficient contrast
# Test theme persistence across page reloads
```

## Troubleshooting

### Theme Not Applied
- Ensure CSS import path is correct: `@import "../../../libs/ui/styles/index.css"`
- Check theme class is added to document root: `document.documentElement.classList`
- Verify theme file exists in `libs/ui/styles/themes/`

### Missing Chart Colors
- Use predefined chart color classes: `.bg-chart-1` through `.bg-chart-5`
- For custom colors, add to theme CSS variables: `--chart-6`, `--chart-7`, etc.

### Gradient Issues
- Ensure gradient CSS variables are defined in theme files
- Use `var(--gradient-chart-warm)` in custom CSS
- Check OKLCH color format is valid

## Architecture Notes

- **Pure CSS**: No JavaScript runtime, just CSS variables and classes
- **shadcn/ui Compatible**: Uses standard CSS variable naming conventions
- **Theme System**: CSS class-based switching with localStorage persistence
- **Color Science**: OKLCH color space for perceptual uniformity
- **Monorepo Ready**: Designed for shared usage across Next.js, Nuxt.js, and TanStack Start apps
- **Extensible**: Easy theme creation via tweakcn.com or manual CSS variables
