# image-wrench

A modern, tree-shakable library of utility functions for image and color processing, designed for use in Vite and other modern JavaScript/TypeScript projects.

## Features

- **Image resizing, metadata extraction, and generation**
- **Color analysis, sorting, and processing**
- **Efficient, tree-shakable ESM modules**
- **Typed with TypeScript**
- **No side effects, easy to integrate**

## Installation

```sh
pnpm add image-wrench
# or
npm install image-wrench
# or
yarn add image-wrench
```

## Usage

Import only what you need for optimal bundle size:

```ts
import { resizeImage } from 'image-wrench/image/resize';
import { getAverageColor } from 'image-wrench/color/sorting';
import type { ImageMetadataDefinition } from 'image-wrench/types';
```

### Example: Resize an Image Blob

```ts
import { resizeImageBlob } from 'image-wrench/image/resize';

const resizedBlob = await resizeImageBlob(originalBlob, 512);
```

### Example: Get Average Color

```ts
import { getAverageColor } from 'image-wrench/color/sorting';
import type { VisualMetadata } from 'image-wrench/types';

const metadata: VisualMetadata = /* ... */;
const avgColor = getAverageColor(metadata);
```

## Tree-shaking

This library is designed for modern bundlers. Only the functions you import will be included in your final bundle.

## TypeScript Support

All functions are fully typed. Types can be imported from the `types` entry point:

```ts
import type { Color, VisualMetadata } from 'image-wrench/types';
```

## Contributing

1. Fork the repo and create a feature branch.
2. Add or update utility functions in the appropriate folder.
3. Add tests in `__tests__` folders next to the code.
4. Run `pnpm test` to ensure all tests pass.
5. Open a pull request!

## License

MIT
