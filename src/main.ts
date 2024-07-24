import type { AbstractEngine, AnimationGroup, Mesh } from "@babylonjs/core";
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene, ScenePerformancePriority } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { VertexAnimationBaker, BakedVertexAnimationManager } from '@babylonjs/core/BakedVertexAnimation';

async function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export async function createVAT(
  scene: Scene,
  mesh: Mesh,
  anims: string | AnimationGroup[] | Texture | Float32Array,
  opts: { printJSON?: boolean; } = {},
) {
  const manager = new BakedVertexAnimationManager(scene);

  mesh.bakedVertexAnimationManager = manager;

  let buffer: Float32Array | undefined;

  if (typeof anims === 'string') {
    const b = new VertexAnimationBaker(scene, mesh);
    buffer = b.loadBakedVertexDataFromJSON(anims);
  } else if (Array.isArray(anims)) {
    buffer = await bakeVertexData(mesh, anims);
  } else if (anims instanceof Float32Array) {
    buffer = anims;
  } else {
    manager.texture = anims;
  }

  mesh.registerInstancedBuffer('bakedVertexAnimationSettingsInstanced', 4);

  if (manager.texture == null && buffer != null) {
    const b = new VertexAnimationBaker(scene, mesh);
    if (opts.printJSON) {
      console.log(vatBufferToJSON(mesh, buffer));
    }

    const t = b.textureFromBakedVertexData(buffer);
    manager.texture = t;
  }

  const sub = scene.onBeforeRenderObservable.add(() => {
    if (scene.deltaTime == null) return;

    manager.time += scene.deltaTime / 1000.0;
  });

  return {
    manager, dispose: (disposeTexture?: boolean) => {
      sub.remove();
      manager.dispose(disposeTexture);
    }
  } as const;
}

export async function bakeVATAsBuffer(
  mesh: Mesh,
  anims: AnimationGroup[],
) {
  return await bakeVertexData(mesh, anims);
}

export function vatBufferToJSON(mesh: Mesh, buffer: Float32Array) {
  const b = new VertexAnimationBaker(mesh.getScene()!, mesh);
  return b.serializeBakedVertexDataToJSON(buffer);
}

async function bakeVertexData(mesh: Mesh, ags: AnimationGroup[]): Promise<Float32Array> {
  const skeleton = mesh.skeleton;

  mesh.computeBonesUsingShaders = false;
  mesh.isVisible = false;

  if (skeleton == null) throw new Error(`You need to assign skeleton to mesh for baking!`);

  const boneCount = skeleton.bones.length;
  /** total number of frames in our animations */
  const frameCount = ags.reduce((acc, ag) => acc + (Math.round(ag.to) - Math.round(ag.from)) + 1, 0);

  // reset our loop data
  let textureIndex = 0;
  const textureSize = (boneCount + 1) * 4 * 4 * frameCount;
  const vertexData = new Float32Array(textureSize);

  function* captureFrame() {
    const skeletonMatrices = skeleton!.getTransformMatrices(mesh);
    vertexData.set(skeletonMatrices, textureIndex * skeletonMatrices.length);
  }

  const scene = mesh.getScene();

  for (const ag of ags) {
    const from = Math.round(ag.from);
    const to = Math.round(ag.to);
    ag.reset();

    for (let frameIndex = from; frameIndex <= to; frameIndex++) {
      if (frameIndex > ag.to) {
        frameIndex = ag.to;
      }

      ag.start(false, 1, frameIndex, frameIndex, false);
      const promise = ag.onAnimationEndObservable.runCoroutineAsync(captureFrame());

      scene.render(false);

      await promise;

      textureIndex++;
      ag.stop();
    }
  }

  return vertexData;
}

function createSceneForBaking(engine: AbstractEngine) {
  const tempScene = new Scene(engine);
  tempScene.useConstantAnimationDeltaTime = true;
  tempScene.performancePriority = ScenePerformancePriority.Aggressive;
  tempScene.autoClear = false;
  tempScene.autoClearDepthAndStencil = false;
  tempScene.skipFrustumClipping = true;
  tempScene._activeMeshesFrozen = true;
  tempScene.physicsEnabled = false;
  tempScene.renderTargetsEnabled = false;
  //@ts-ignore
  tempScene._skipEvaluateActiveMeshesCompletely = true;
  tempScene._activeMeshesFrozenButKeepClipping = false;
  tempScene.renderingManager.maintainStateBetweenFrames = true;

  tempScene.activeCamera = new ArcRotateCamera('_tempCamera', 0, 0, 100, Vector3.Zero(), tempScene, true);

  return tempScene;
}

export async function bakeMesh(engine: AbstractEngine, meshPath: string) {
  const tempScene = createSceneForBaking(engine);

  const assetContainer = await SceneLoader.LoadAssetContainerAsync("", meshPath, tempScene);

  const anims = assetContainer.animationGroups;
  anims.forEach(ag => {
    ag.stop();
    ag.reset();
    tempScene.addAnimationGroup(ag);
  });

  const mesh = assetContainer.meshes.find(m => m.skeleton!) as Mesh;
  const skeleton = mesh.skeleton!;
  tempScene.addMesh(mesh);
  tempScene.addSkeleton(skeleton);

  tempScene.meshes.forEach(m => {
    m.computeBonesUsingShaders = false;
    m.isVisible = false;
    m.alwaysSelectAsActiveMesh = true;
  });

  skeleton.useTextureToStoreBoneMatrices = false;
  const skelPrepareSub = tempScene.onBeforeRenderObservable.add(() => skeleton.prepare(true));

  while (!tempScene.isReady()) await wait(0);

  const result = await bakeVATAsBuffer(mesh, anims);

  skelPrepareSub.remove();
  assetContainer.dispose();
  tempScene.dispose();

  return result;
}
