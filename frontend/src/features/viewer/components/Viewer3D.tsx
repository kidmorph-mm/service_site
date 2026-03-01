import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";

function ObjModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);

  // ✅ 같은 OBJ를 여러 Canvas에서 동시에 쓸 수 있도록 clone해서 사용
  const cloned = useMemo(() => {
    const c = obj.clone(true);

    c.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if ((mesh as any).isMesh) {
        mesh.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
      }
    });

    return c;
  }, [obj]);

  return (
    <Center>
      <primitive object={cloned} />
    </Center>
  );
}

export default function Viewer3D({ objUrl }: { objUrl: string }) {
  return (
    <div
      style={{
        height: 360,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #eee",
        position: "relative",
        isolation: "isolate",
        background: "#fafafa",
      }}
    >
      <Canvas
        key={objUrl}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
        camera={{ position: [0, 1.2, 2.5], fov: 45 }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 3]} intensity={1.2} />

        <Suspense fallback={null}>
          <ObjModel url={objUrl} />
        </Suspense>

        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}