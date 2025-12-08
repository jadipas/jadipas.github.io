import React, { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { loadGLTFModel, mixer } from "../lib/model";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function easeOutCirc(x: number) {
  return Math.sqrt(1 - Math.pow(x - 1, 4));
}

interface MascotProps {
  className?: string;
}

const Mascot: React.FC<MascotProps> = ({ className = "" }) => {
  const refContainer = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
  const [scene] = useState(new THREE.Scene());

  const handleWindowResize = useCallback(() => {
    const container = refContainer.current;
    if (container && renderer) {
      const scW = container.clientWidth;
      const scH = container.clientHeight;
      renderer.setSize(scW, scH);
    }
  }, [renderer]);

  useEffect(() => {
    const container = refContainer.current;
    if (container && !renderer) {
      const scW = container.clientWidth;
      const scH = container.clientHeight;

      const newRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      newRenderer.setPixelRatio(window.devicePixelRatio);
      newRenderer.setSize(scW, scH);
      newRenderer.shadowMap.enabled = true;
      newRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(newRenderer.domElement);
      // Add ground plane to receive shadow
      const groundGeometry = new THREE.PlaneGeometry(10, 10);
      const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0.01; // Move plane closer to mascot
      ground.receiveShadow = true;
      scene.add(ground);
      setRenderer(newRenderer);

      // Scene setup
      const camera = new THREE.PerspectiveCamera(50, scW / scH, 0.01, 50000);
      camera.position.set(0, 1.2, 3);
      camera.lookAt(0, 1.2, 0);

      // Add OrbitControls for camera interaction
      const controls = new OrbitControls(camera, newRenderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 2;
      controls.maxDistance = 20;
      controls.target.set(0, 1.2, 0);
      controls.update();

      // Strong ambient light to fill shadows and create friendly feeling
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
      scene.add(ambientLight);

      // Single main directional light from front-left, angled down
      const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
      mainLight.position.set(2, 4, 3);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      scene.add(mainLight);

      // Soft rim light from behind (no shadow) for dimension
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
      rimLight.position.set(0, 3, -4);
      rimLight.castShadow = false;
      scene.add(rimLight);

      const baseUrl = import.meta.env.BASE_URL || "/";
      const glbPath = `${baseUrl}avatar.glb`;

      loadGLTFModel(scene, glbPath, {
        receiveShadow: true,
        castShadow: true,
      })
        .then(() => {
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });

      // Animation/render loop for interactive controls
      let req: number | null = null;
      const clock = new THREE.Clock();
      const animate = () => {
        req = requestAnimationFrame(animate);
        controls.update();
        if (mixer) mixer.update(clock.getDelta());
        newRenderer.render(scene, camera);
      };
      animate();

      return () => {
        if (req !== null) cancelAnimationFrame(req);
        newRenderer.dispose();
      };
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleWindowResize, false);
    return () => {
      window.removeEventListener("resize", handleWindowResize, false);
    };
  }, [renderer, handleWindowResize]);

  return (
    <div
      ref={refContainer}
      className={`relative ${className}`}
      style={{ width: '350px', height: '350px', minHeight: '280px', maxWidth: '100%' }}
    >
      {loading && (
        <div className="absolute left-1/2 top-1/2 -ml-4 -mt-4 z-10">
          <div className="w-8 h-8 border-4 border-neutral-600 border-t-neutral-300 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default Mascot;
