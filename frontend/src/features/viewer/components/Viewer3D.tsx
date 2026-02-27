import { Suspense } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";

function ObjModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);

  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if ((mesh as any).isMesh) {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    }
  });

  return (
    <Center>
      <primitive object={obj} />
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
        position: "relative",     // ✅ 이게 핵심(각 카드 안에서 canvas가 잡힘)
        isolation: "isolate",     // ✅ 겹침/레이어링 문제 방지
        background: "#fafafa",
      }}
    >
      <Canvas
        key={objUrl} // ✅ url 바뀔 때 캔버스/로더 상태 확실히 리셋
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