import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Center } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";

type Vec3 = [number, number, number];

type ViewState = {
  pos: Vec3;
  target: Vec3;
  zoom: number;
};

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

function SyncControls({
  mode,
  view,
  setView,
}: {
  mode: "master" | "slave";
  view: ViewState;
  setView: (v: ViewState) => void;
}) {
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  // slave는 master view를 따라가기만(조작 불가)
  useEffect(() => {
    if (mode !== "slave") return;
    const c = controlsRef.current;
    if (!c) return;

    camera.position.set(view.pos[0], view.pos[1], view.pos[2]);
    camera.zoom = view.zoom;
    camera.updateProjectionMatrix();

    c.target.set(view.target[0], view.target[1], view.target[2]);
    c.update();
  }, [mode, view, camera]);

  const onChange = () => {
    if (mode !== "master") return;
    const c = controlsRef.current;
    if (!c) return;

    setView({
      pos: [camera.position.x, camera.position.y, camera.position.z],
      target: [c.target.x, c.target.y, c.target.z],
      zoom: camera.zoom,
    });
  };

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={mode === "master"}  // ✅ 오른쪽은 따라가기만
      onChange={onChange}
    />
  );
}

function ViewerPane({
  objUrl,
  mode,
  view,
  setView,
}: {
  objUrl: string;
  mode: "master" | "slave";
  view: ViewState;
  setView: (v: ViewState) => void;
}) {
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
        background: "#fafafa",
        // ✅ 레이아웃 폭/오버플로우 문제 방지 + 캔버스가 박스 밖으로 못 나가게
        contain: "layout paint size",
      }}
    >
      <Canvas
        key={objUrl + mode}
        style={{ width: "100%", height: "100%", display: "block" }} // ✅ flow 렌더
        camera={{ position: view.pos, fov: 45, zoom: view.zoom }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 3]} intensity={1.2} />

        <Suspense fallback={null}>
          <ObjModel url={objUrl} />
        </Suspense>

        <SyncControls mode={mode} view={view} setView={setView} />
      </Canvas>
    </div>
  );
}

export default function CompareViewer3D({
  leftObjUrl,
  rightObjUrl,
}: {
  leftObjUrl: string;
  rightObjUrl: string;
}) {
  const [view, setView] = useState<ViewState>({
    pos: [0, 1.2, 2.5],
    target: [0, 0, 0],
    zoom: 1,
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minWidth: 0 }}>
      <ViewerPane objUrl={leftObjUrl} mode="master" view={view} setView={setView} />
      <ViewerPane objUrl={rightObjUrl} mode="slave" view={view} setView={setView} />
    </div>
  );
}