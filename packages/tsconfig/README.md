# @sfos/tsconfig

Shared TypeScript configurations.

## Variants

| Variant | When to use                                               |
| ------- | --------------------------------------------------------- |
| `base`  | Anything; pure type-checking, no emit settings            |
| `lib`   | Library packages that emit `dist/` with declaration files |
| `node`  | Node-targeted libraries (ESM, NodeNext resolution)        |
| `app`   | Apps (no emit; bundler handles output)                    |
| `react` | React apps (JSX + DOM libs)                               |

## Usage

In a package's `tsconfig.json`:

```json
{
  "extends": "@sfos/tsconfig/lib",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

## Inheritance

`react` → `app` → `base` → repo-root `tsconfig.base.json`.

`node` → `lib` → `base` → repo-root `tsconfig.base.json`.

The repo-root `tsconfig.base.json` is the ultimate source of strict settings (noUncheckedIndexedAccess, exactOptionalPropertyTypes, etc.).
