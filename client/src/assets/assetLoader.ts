import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

let loaderInstance: GLTFLoader | null = null;
let cachedBaseGltf: GLTF | null = null;
let cachedClothingGltf: GLTF | null = null;

export function getGltfLoader(renderer?: THREE.WebGLRenderer): GLTFLoader {
  if (loaderInstance) return loaderInstance;
  const loader = new GLTFLoader();

  // Configured for optional Draco-compressed Mixamo/Quaternius drop-in assets
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');
  loader.setDRACOLoader(draco);

  if (renderer) {
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath('/basis/');
    ktx2.detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  }

  loaderInstance = loader;
  return loader;
}

export async function loadCharacterAssets(renderer?: THREE.WebGLRenderer): Promise<{
  baseGltf: GLTF;
  clothingGltf: GLTF;
}> {
  const loader = getGltfLoader(renderer);
  if (!cachedBaseGltf) {
    cachedBaseGltf = await loader.loadAsync('/models/pirate_base.glb');
  }
  if (!cachedClothingGltf) {
    cachedClothingGltf = await loader.loadAsync('/models/clothing_pack.glb');
  }
  return { baseGltf: cachedBaseGltf, clothingGltf: cachedClothingGltf };
}
