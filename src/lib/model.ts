import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as THREE from "three";

export let mixer: THREE.AnimationMixer | null = null;

export function loadGLTFModel(
  scene: THREE.Scene,
  glbPath: string,
  options = { receiveShadow: true, castShadow: true }
): Promise<THREE.Group> {
  const { receiveShadow, castShadow } = options;
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      glbPath,
      (gltf) => {
        const obj = gltf.scene;
        obj.name = "avatar";
        obj.position.y = 0;
        obj.position.x = 0;
        obj.position.z = 0;
        // Rotate model 180 degrees around Y axis
        obj.rotation.y = Math.PI;

        // Scale the model if it's too small/large
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim; // Target size of 2 units
        obj.scale.setScalar(scale);

        obj.receiveShadow = receiveShadow;
        obj.castShadow = castShadow;
        scene.add(obj);

        console.log("Model added to scene. Size:", size, "Scale:", scale);

        // Animation setup
        mixer = new THREE.AnimationMixer(obj);
        const clips = gltf.animations;
        console.log("All available animations:", clips.map(c => c.name));
        // Filter out any clips you never want to play
        const availableClips = clips.filter((c) => c.name !== "Spin");
        console.log("Playing animations:", availableClips.map(c => c.name));

        // Whenever any action finishes, queue up another random one
        mixer.addEventListener("finished", (e) => {
          const prevName = (e.action as any)._clip.name;
          playRandomAnimation(prevName);
        });

        function playRandomAnimation(prevName?: string) {
          // Exclude the previous clip so we don't repeat it immediately
          const pool = prevName
            ? availableClips.filter((c) => c.name !== prevName)
            : availableClips;
          if (pool.length === 0) return;
          const clip = pool[Math.floor(Math.random() * pool.length)];
          const action = mixer!.clipAction(clip);
          action.reset();
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
        }

        // Kick things off
        playRandomAnimation();

        obj.traverse(function (child) {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).castShadow = castShadow;
            (child as THREE.Mesh).receiveShadow = receiveShadow;
          }
        });
        resolve(obj);
      },
      undefined,
      function (error) {
        reject(error);
      }
    );
  });
}
