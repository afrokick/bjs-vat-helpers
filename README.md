# bjs-vat-helpers

Several helpful functions to work with VAT

## Baking mesh

`function bakeMesh(engine: AbstractEngine, meshPath: string): Promise<Float32Array>`

Bake mesh's animations into `Float32Array`. Requires `Skeleton` and `AnimationGroups`.

## Creating VAT from Float32Array

```typescript
function createVAT(
  scene: Scene,
  mesh: Mesh,
  anims: string | AnimationGroup[] | Texture | Float32Array,
  opts?: {
    printJSON?: boolean;
  }
): Promise<{
  readonly manager: BakedVertexAnimationManager;
  readonly dispose: (disposeTexture?: boolean) => void;
}>;
```
