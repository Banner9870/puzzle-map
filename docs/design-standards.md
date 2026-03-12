# Design Standards – Lock and Archer

**Reference.** These standards apply to Lock & Archer’s UI work. They should inform **all new guide, data-source, and feed UIs** described in the roadmap. Implementation is partial (e.g. tokens and variables in use; full token JSON and typography may not be applied everywhere).

> **Critical rule:** Never hardcode hex values in components. Always use CSS variables (or your stack’s design tokens).

---

## 1. Design Tokens

### Source of truth

- **JSON**: `brand/tokens.json` – Complete token definitions (see [§4 Token reference](#4-chicago-local-token-reference-v1) below).
- **CSS variables**: `:root` block in your global stylesheet (e.g. `application.scss` or equivalent).

### Critical rule

**NEVER hardcode hex values in components. ALWAYS use CSS variables.**

✅ Good:

```html
<div style="color: var(--brand-red); background: var(--bg-primary);">
```

❌ Bad:

```html
<div style="color: #ed0000; background: #ffffff;">
```

### Brand colors

| Token | CSS variable example | Hex |
|-------|----------------------|-----|
| Primary red | `var(--brand-red)` | `#ed0000` |
| Primary red dark | `var(--brand-red-dark)` | `#d60000` |
| Headlines | `var(--text-headline)` | `#252525` |
| Body text | `var(--text-body)` | `#636466` |
| Background | `var(--bg-primary)` | `#ffffff` |
| Border | `var(--border-color)` | `#e5e7eb` |

### Typography

- **Headlines (h1–h6)**: `font-family: var(--font-serif)` – Charter, Georgia, serif.
- **Body text**: `font-family: var(--font-sans)` – Source Sans Pro, sans-serif.

### Spacing, borders, shadows

- Use utility classes for layout and spacing (`p-*`, `m-*`, `gap-*`) or your framework’s equivalents.
- Use CSS variables for radii and shadows: `var(--radius)`, `var(--radius-lg)`, `var(--shadow)`.
- Full scale: see `brand/tokens.json` (§4 below).

---

## 2. Bootstrap / utility usage

**Priority order:**

1. **Utilities first** – Layout, spacing, typography (e.g. `d-flex`, `gap-3`, `p-4`, `mb-3`).
2. **CSS variables for colors** – Do not use framework default colors like `text-primary` for brand; use `style="color: var(--brand-red)"` or a class that maps to that token.
3. **Custom classes** – Only when utilities + tokens cannot express the brand look.

**Bootstrap components**

- Use cards, buttons, forms, dropdowns, modals as a base; override with CSS variables and custom classes.
- Primary color maps to **brand red** via CSS variables.
- Use `!important` sparingly, only for framework overrides.

---

## 3. Styling approach

### CSS methodology

- **Utilities** – Layout, spacing, typography.
- **CSS custom properties** – Colors and design tokens.
- **Custom classes** – Brand-specific components (e.g. `.feed-card`, `.rail-card`).
- **Inline styles** – Allowed for dynamic values, but must use CSS variables, not raw hex.

### Component styling patterns

**Example (partial/component):**

```html
<div class="card mb-4"
     style="border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow);">
  <div class="card-body p-4">
    <h5 style="font-family: var(--font-serif); color: var(--text-headline);">
      Title
    </h5>
  </div>
</div>
```

**Custom class (in global SCSS):**

```scss
.feed-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  background: var(--bg-primary);
}
```

### Responsive design

- **Mobile-first**.
- Use responsive utilities: `d-none d-md-block`, `col-12 col-md-6` (or equivalents).
- Breakpoints: sm 640px, md 768px, lg 1024px, xl 1280px, xxl 1536px.

### Icons

- **Library**: Bootstrap Icons (or equivalent).
- **Usage**: `<i class="bi bi-icon-name"></i>`.
- **Sizing**: Inline `style="font-size: Xrem"` or utility classes.
- **Colors**: CSS variables or text utilities.
- **Accessibility**: Icon-only buttons **must** have `aria-label`.

---

## 4. Lock and Archer token reference (v1)

The design system is defined in `brand/tokens.json`. Below is the full **Lock and Archer** token set (version 1). Use these tokens (via CSS variables or your stack’s token layer) instead of hardcoding values.

### Quick reference

| Use case | Token / variable | Value |
|----------|------------------|--------|
| Brand red (primary) | `brand_red` | `#ed0000` |
| Brand red (hover/dark) | `brand_red_dark` | `#d60000` |
| Headlines / primary text | `text_1` → semantic `text_primary` | `#252525` |
| Body text | `text_2` → semantic `text_secondary` | `#636466` |
| Background / surface | `background` → semantic `surface` | `#ffffff` |
| Borders / outline | `border` → semantic `outline` | `#e5e7eb` |
| Headings font | `typography.fonts.serif_headings` | Charter, Georgia, serif |
| Body font | `typography.fonts.sans_body` | Source Sans Pro, system-ui, sans-serif |
| Border radius | `radii.1` / `radii.2` / `radii.3` | 6px / 10px / 14px |
| Breakpoints | `breakpoints.sm` … `xxl` | 640px … 1536px |

**Semantic colors**: `action_primary`, `link` → brand red; `state.info` / `state.success` / `state.warning` / `state.danger` for feedback. **Bootstrap map** ties Bootstrap variables to these tokens.

### Full token definition (JSON)

```json
{
  "name": "Lock and Archer",
  "version": 1,
  "colors": {
    "brand_red": "#ed0000",
    "brand_red_dark": "#d60000",
    "text_1": "#252525",
    "text_2": "#636466",
    "background": "#ffffff",
    "border": "#e5e7eb",
    "gray_50": "#f9fafb",
    "gray_100": "#f3f4f6",
    "gray_200": "#e5e7eb",
    "gray_300": "#d1d5db",
    "gray_400": "#9ca3af",
    "gray_500": "#6b7280",
    "gray_600": "#4b5563",
    "gray_700": "#374151",
    "gray_800": "#1f2937",
    "gray_900": "#111827"
  },
  "semantic": {
    "text_primary": { "value": "{colors.text_1}", "type": "color" },
    "text_secondary": { "value": "{colors.text_2}", "type": "color" },
    "surface": { "value": "{colors.background}", "type": "color" },
    "outline": { "value": "{colors.border}", "type": "color" },
    "action_primary": { "value": "{colors.brand_red}", "type": "color" },
    "link": { "value": "{colors.brand_red}", "type": "color" },
    "state": {
      "info": { "value": "#3b82f6", "type": "color" },
      "success": { "value": "#10b981", "type": "color" },
      "warning": { "value": "#f59e0b", "type": "color" },
      "danger": { "value": "#ef4444", "type": "color" }
    }
  },
  "typography": {
    "fonts": {
      "serif_headings": "Charter, Georgia, \"Times New Roman\", serif",
      "sans_body": "Source Sans Pro, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif"
    },
    "sizes": {
      "base": "1rem",
      "sm": "0.875rem",
      "lg": "1.125rem"
    }
  },
  "radii": {
    "1": { "value": "6px", "type": "borderRadius" },
    "2": { "value": "10px", "type": "borderRadius" },
    "3": { "value": "14px", "type": "borderRadius" }
  },
  "shadows": {
    "1": { "value": "0 1px 2px rgba(0,0,0,.08)", "type": "boxShadow" },
    "2": { "value": "0 2px 8px rgba(0,0,0,.12)", "type": "boxShadow" }
  },
  "breakpoints": {
    "sm": "640px",
    "md": "768px",
    "lg": "1024px",
    "xl": "1280px",
    "xxl": "1536px"
  },
  "z_index": {
    "base": 0,
    "dropdown": 1000,
    "sticky": 1020,
    "fixed": 1030,
    "modal_backdrop": 1040,
    "modal": 1050,
    "popover": 1060,
    "tooltip": 1070
  },
  "bootstrap_map": {
    "primary": "{colors.brand_red}",
    "secondary": "{colors.text_2}",
    "success": "{semantic.state.success}",
    "info": "{semantic.state.info}",
    "warning": "{semantic.state.warning}",
    "danger": "{semantic.state.danger}",
    "light": "{colors.gray_50}",
    "body-bg": "{semantic.surface}",
    "body-color": "{semantic.text_secondary}",
    "border-color": "{semantic.outline}",
    "link-color": "{semantic.link}",
    "font-family-sans-serif": "{typography.fonts.sans_body}",
    "font-family-serif": "{typography.fonts.serif_headings}",
    "font-family-base": "{typography.fonts.sans_body}",
    "font-size-base": "{typography.sizes.base}",
    "font-size-sm": "{typography.sizes.sm}",
    "font-size-lg": "{typography.sizes.lg}",
    "grid-breakpoints": {
      "sm": "{breakpoints.sm}",
      "md": "{breakpoints.md}",
      "lg": "{breakpoints.lg}",
      "xl": "{breakpoints.xl}",
      "xxl": "{breakpoints.xxl}"
    },
    "zindex-dropdown": "{z_index.dropdown}",
    "zindex-sticky": "{z_index.sticky}",
    "zindex-fixed": "{z_index.fixed}",
    "zindex-modal-backdrop": "{z_index.modal_backdrop}",
    "zindex-modal": "{z_index.modal}",
    "zindex-popover": "{z_index.popover}",
    "zindex-tooltip": "{z_index.tooltip}"
  },
  "right_rail": ["Daily Digest", "Neighborly Kudos", "Upcoming Events", "Top Bugs"],
  "post_types": ["Bug", "Recommendation", "Event", "Question", "General"],
  "user_roles": ["user", "moderator", "admin", "journalist", "business_owner"]
}
```

### Notes

- **`right_rail`**, **`post_types`**, and **`user_roles`** are product/config values used by Lock and Archer; reuse or adapt when building guides, feeds, and roles.
- In CSS/SCSS, expose tokens via `:root` (e.g. `--brand-red: #ed0000`) so the “no hardcoded hex” rule is easy to follow.
- **Source of truth** for the repo is `brand/tokens.json`; this doc is for reference and onboarding.

---

## 5. Component organization

### Partial / component naming

- Shared: `app/views/shared/_component_name.html.erb` (or equivalent in your stack).
- Feature-specific: `app/views/[controller]/_partial_name.html.erb`.

### Component documentation

Document props/locals at the top of each reusable component:

```erb
<%# Component: Post Card
  Required locals:
  - post: Post object
  Optional locals:
  - show_media: boolean (default: true)
%>
```

### Carousels / image galleries

- Use for 2+ images (e.g. up to 10 per post).
- Style in global styles (e.g. `.carousel`).
- Images: `object-fit: contain` to preserve aspect ratio.

---

## 6. Related references

- **`brand/tokens.json`** – Canonical token definitions.
- **`docs/figma-integration-guide.md`** – Figma integration (if present).
- **`.cursor/rules/300-a11y.mdc`** – Accessibility requirements.
