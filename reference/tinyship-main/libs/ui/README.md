# TinyShip UI Library

A pure CSS-based design system for modern web applications, built with shadcn/ui theme system, Tailwind CSS and CSS variables.

## Features

- 🎨 **shadcn/ui Compatible**: Built on the popular shadcn/ui theme system
- 🌈 **Multi-Theme System**: 5 beautiful color schemes (Default, Claude, Cosmic Night, Modern Minimal, Ocean Breeze)
- 🌗 **Dark Mode Support**: Automatic dark mode adaptation for all themes
- 🎯 **CSS Variables**: Modern CSS custom properties following shadcn/ui conventions
- 📊 **Chart Color System**: 5-color chart palette with transparency variants
- 🎨 **Gradient System**: Warm and cool gradient combinations
- 🚀 **Zero Dependencies**: Pure CSS solution
- 📦 **Lightweight**: Minimal bundle size
- 🛠️ **Extensible**: Easy integration with shadcn/ui theme generators like [tweakcn.com](https://tweakcn.com/editor/theme)

## Philosophy

This UI library follows the principle of separation of concerns:
- **UI Library**: Pure CSS themes and styles
- **Application**: React components and hooks

## Theme System

The UI library includes a sophisticated multi-theme system based on shadcn/ui's CSS variable architecture:

### Color Schemes

1. **Default Theme**: Classic gray-scale with blue-purple gradients
2. **Claude Theme**: Warm, sophisticated theme inspired by Claude AI with orange accents
3. **Cosmic Night Theme**: Mystical purple-based theme with cosmic vibes
4. **Modern Minimal Theme**: Clean purple-blue theme for modern interfaces
5. **Ocean Breeze Theme**: Fresh teal-green theme inspired by ocean waters

### CSS Variables (shadcn/ui Standard)

All themes follow the shadcn/ui CSS variable naming conventions for maximum compatibility.

#### Default Theme
- Primary: `oklch(0.205 0 0)` (Classic gray)
- Chart Colors: Blue, teal, purple, yellow, orange spectrum
- Gradients: `gradient-chart-warm` (orange → yellow), `gradient-chart-cool` (blue → purple)

#### Claude Theme  
- Primary: `oklch(0.6171 0.1375 39.0427)` (Warm orange)
- Chart Colors: Orange, purple, light gray, light purple, orange variants
- Gradients: `gradient-chart-warm` (orange → orange), `gradient-chart-cool` (purple → orange)

#### Cosmic Night Theme
- Primary: `oklch(0.5417 0.1790 288.0332)` (Deep purple)
- Chart Colors: Purple, lavender, magenta, blue-purple, dark purple spectrum
- Gradients: `gradient-chart-warm` (purple → magenta), `gradient-chart-cool` (lavender → blue-purple)

#### Modern Minimal Theme
- Primary: `oklch(0.6231 0.1880 259.8145)` (Modern purple-blue)
- Chart Colors: Purple-blue gradient spectrum from light to dark
- Gradients: `gradient-chart-warm` (purple-blue → deep purple), `gradient-chart-cool` (deep purple → dark purple)

#### Ocean Breeze Theme
- Primary: `oklch(0.7227 0.1920 149.5793)` (Ocean teal-green)
- Chart Colors: Teal-green gradient spectrum from bright to deep
- Gradients: `gradient-chart-warm` (teal → green), `gradient-chart-cool` (blue-green → deep teal)

## Usage

### 1. Import Styles

In your application's CSS file (e.g., `globals.css`):

```css
/* Import shared UI styles */
@import "../../../libs/ui/styles/index.css";
```

### 2. Theme Switching

The theme system uses CSS classes on the document root:
- `.dark` for dark mode
- `.theme-claude` for Claude color scheme
- `.theme-cosmic-night` for Cosmic Night color scheme
- `.theme-modern-minimal` for Modern Minimal color scheme
- `.theme-ocean-breeze` for Ocean Breeze color scheme

Example theme switching logic:
```javascript
// Switch to dark mode
document.documentElement.classList.add('dark')

// Switch to Claude theme
document.documentElement.classList.add('theme-claude')

// Switch to Ocean Breeze theme
document.documentElement.classList.add('theme-ocean-breeze')

// Ocean Breeze dark mode
document.documentElement.classList.add('theme-ocean-breeze', 'dark')

// Modern Minimal theme
document.documentElement.classList.add('theme-modern-minimal')
```

## Utility Classes

### Chart Colors
```css
.bg-chart-1, .bg-chart-2, .bg-chart-3, .bg-chart-4, .bg-chart-5  /* Chart backgrounds */
.text-chart-1, .text-chart-2, .text-chart-3, .text-chart-4, .text-chart-5  /* Chart text colors */
.bg-chart-1-10, .bg-chart-1-15, .bg-chart-2-15, etc.  /* Chart colors with transparency */
```

### Gradient Backgrounds
```css
.bg-gradient-chart-warm        /* Warm gradient (theme-aware) */
.bg-gradient-chart-cool        /* Cool gradient (theme-aware) */
```

### Gradient Text
```css
.text-gradient-chart-warm      /* Warm gradient text effect */
.text-gradient-chart-cool      /* Cool gradient text effect */
```

### Animations
```css
.animate-blob                  /* Floating blob animation */
.animation-delay-2000          /* 2s animation delay */
.animation-delay-4000          /* 4s animation delay */
```

## File Structure

```
libs/ui/
├── styles/
│   ├── themes/
│   │   ├── default.css         # Default theme variables
│   │   ├── claude.css          # Claude theme variables
│   │   ├── cosmic-night.css    # Cosmic Night theme variables
│   │   ├── modern-minimal.css  # Modern Minimal theme variables
│   │   └── ocean-breeze.css    # Ocean Breeze theme variables
│   └── index.css              # Main styles and utilities
├── utils/
│   └── cn.ts                  # className utility function
├── themes.ts                  # Theme configuration and utilities
└── README.md
```

## Examples

### Basic Usage with Tailwind (shadcn/ui Compatible)

```html
<!-- Default button using shadcn/ui theme variables -->
<button class="bg-primary text-primary-foreground px-4 py-2 rounded">
  Click me
</button>

<!-- Chart color backgrounds -->
<div class="bg-chart-1 text-white p-4 rounded">Chart Color 1</div>
<div class="bg-chart-2 text-white p-4 rounded">Chart Color 2</div>

<!-- Gradient backgrounds -->
<div class="bg-gradient-chart-warm p-8 rounded-lg">
  <h2 class="text-white">Warm gradient background</h2>
</div>

<div class="bg-gradient-chart-cool p-8 rounded-lg">
  <h2 class="text-white">Cool gradient background</h2>
</div>

<!-- Gradient text -->
<h1 class="text-gradient-chart-warm text-4xl font-bold">
  Warm Gradient Text
</h1>

<h1 class="text-gradient-chart-cool text-4xl font-bold">
  Cool Gradient Text
</h1>
```

### CSS Custom Properties (shadcn/ui Variables)

All theme colors are available as standard shadcn/ui CSS custom properties:

```css
.my-component {
  background-color: var(--primary);
  color: var(--primary-foreground);
  border: 1px solid var(--border);
}

.my-chart-element {
  background-color: var(--chart-1-bg);
  color: var(--chart-1-text);
}

.my-gradient {
  background: var(--gradient-chart-warm);
}

.my-cool-gradient {
  background: var(--gradient-chart-cool);
}
```

## Theme Implementation

### CSS Layer Structure
```css
@import './themes/default.css';         /* Base theme (:root) */
@import './themes/claude.css';          /* Override theme (.theme-claude) */
@import './themes/cosmic-night.css';    /* Override theme (.theme-cosmic-night) */
@import './themes/modern-minimal.css';  /* Override theme (.theme-modern-minimal) */
@import './themes/ocean-breeze.css';    /* Override theme (.theme-ocean-breeze) */
```

### Adding New Themes

You can easily create new themes using the [tweakcn.com theme generator](https://tweakcn.com/editor/theme), which provides a visual interface for customizing shadcn/ui themes. This ensures full compatibility with the shadcn/ui ecosystem.

#### Method 1: Using tweakcn.com (Recommended)

1. Visit [https://tweakcn.com/editor/theme](https://tweakcn.com/editor/theme)
2. Customize colors using the visual editor
3. Export the theme CSS
4. Create a new theme file in `libs/ui/styles/themes/`
5. Add the generated CSS with a class selector
6. Add required gradient variables
7. Update theme configuration

#### Method 2: Manual Creation

1. Create a new theme file in `libs/ui/styles/themes/`
2. Use CSS class selector (e.g., `.theme-myname`)
3. Define all required CSS variables
4. Add import to `index.css`

#### Example: Converting tweakcn.com export

After exporting from tweakcn.com, you'll get standard shadcn/ui CSS variables like:

```css
:root {
  --background: oklch(0.9911 0 0);
  --foreground: oklch(0.2046 0 0);
  --primary: oklch(0.8348 0.1302 160.9080);
  --chart-1: oklch(0.8348 0.1302 160.9080);
  --chart-2: oklch(0.6231 0.1880 259.8145);
  /* ... other variables */
}
```

Convert it to our format:

```css
/* libs/ui/styles/themes/mytheme.css */
.theme-mytheme {
  /* All the shadcn/ui variables from tweakcn.com export */
  --background: oklch(0.9911 0 0);
  --foreground: oklch(0.2046 0 0);
  --primary: oklch(0.8348 0.1302 160.9080);
  --chart-1: oklch(0.8348 0.1302 160.9080);
  --chart-2: oklch(0.6231 0.1880 259.8145);
  --chart-3: oklch(0.6056 0.2189 292.7172);
  --chart-4: oklch(0.7686 0.1647 70.0804);
  --chart-5: oklch(0.6959 0.1491 162.4796);
  /* ... other variables from export */
  
  /* Add required chart transparency variants */
  --chart-1-bg-10: oklch(0.8348 0.1302 160.9080 / 0.1);
  --chart-1-bg-15: oklch(0.8348 0.1302 160.9080 / 0.15);
  --chart-2-bg-15: oklch(0.6231 0.1880 259.8145 / 0.15);
  --chart-3-bg-15: oklch(0.6056 0.2189 292.7172 / 0.15);
  --chart-4-bg-15: oklch(0.7686 0.1647 70.0804 / 0.15);
  --chart-5-bg-15: oklch(0.6959 0.1491 162.4796 / 0.15);
  
  /* Add required gradients */
  --gradient-chart-warm: linear-gradient(to right, var(--chart-1), var(--chart-4));
  --gradient-chart-cool: linear-gradient(to right, var(--chart-2), var(--chart-5));
}

.theme-mytheme.dark {
  /* Dark mode shadcn/ui variables from tweakcn.com export */
  --background: oklch(0.1822 0 0);
  --foreground: oklch(0.9288 0.0126 255.5078);
  /* ... other dark mode variables */
  
  /* Update chart transparency variants for dark mode */
  --chart-1-bg-10: oklch(from var(--chart-1) l c h / 0.1);
  --chart-1-bg-15: oklch(from var(--chart-1) l c h / 0.15);
  /* ... other transparency variants */
  
  /* Update gradients for dark mode */
  --gradient-chart-warm: linear-gradient(to right, var(--chart-1), var(--chart-4));
  --gradient-chart-cool: linear-gradient(to right, var(--chart-2), var(--chart-5));
}
```

#### Final Steps

1. Add your theme import to `libs/ui/styles/index.css`:
   ```css
   @import './themes/mytheme.css';
   ```

2. Update `libs/ui/themes.ts` configuration:
   ```typescript
   export const COLOR_SCHEMES = [
     // ... existing schemes
     'mytheme'
   ] as const
   
   export const COLOR_SCHEME_CLASSES = {
     // ... existing classes
     'mytheme': 'theme-mytheme',
   } as const
   
   export const THEME_CONFIG = {
     // ... existing configs
     'mytheme': {
       name: 'My Theme',
       color: '#your-primary-color' // Use your primary color hex
     }
   } as const
   ```


### Key Features

- **Persistent Storage**: Theme preferences saved to localStorage
- **System Preference Detection**: Automatically detects user's system theme
- **Type Safety**: Full TypeScript support with proper typing
- **Scalable Configuration**: Easy to add new themes via `THEME_CONFIG`
- **Visual Indicators**: Each theme has a unique color indicator
- **Hydration Safe**: Prevents hydration mismatches in SSR


## Design Principles

- **Separation of Concerns**: Styles separate from logic
- **CSS-First**: Leverage native CSS features
- **Performance**: Minimal runtime overhead
- **Flexibility**: Easy to customize and extend
- **Compatibility**: Works with any framework or vanilla JS 