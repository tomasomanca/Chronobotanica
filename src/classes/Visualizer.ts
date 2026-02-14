import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Garden } from './Garden';
import { CellType } from '../types';
import {
  CELL_SIZE,
  COLOR_BG,
  COLOR_CRYSTAL,
  COLOR_SUN,
  COLOR_ASH,
  MAX_INSTANCES
} from '../constants';

export class Visualizer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  private plantMesh: THREE.InstancedMesh;
  private sunMesh: THREE.InstancedMesh;

  private dummy: THREE.Object3D;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;

  private sunLight: THREE.PointLight;
  private ambientLight: THREE.AmbientLight;

  private sunOffsets: { x: number, y: number, z: number }[] = [];

  // Mapping array to link InstancedMesh index -> Garden Map Key
  private instanceIdToKey: number[] = [];

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLOR_BG);
    this.scene.fog = new THREE.FogExp2(COLOR_BG, 0.001);

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 1000);
    this.camera.position.set(130, 20, 130);
    this.camera.lookAt(50, 60, 50);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(50, 40, 50);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 500;
    this.controls.minDistance = 10;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;

    // Ambient Light 0.15 for high contrast night
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.ambientLight);

    // Dynamic Sun Light
    this.sunLight = new THREE.PointLight(COLOR_SUN, 1800.0, 0, 1);
    this.sunLight.position.set(50, 110, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.0001;
    this.scene.add(this.sunLight);

    const geometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);

    // Plant Material
    const plantMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.1,
    });
    this.plantMesh = new THREE.InstancedMesh(geometry, plantMat, MAX_INSTANCES);
    this.plantMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.plantMesh.castShadow = true;
    this.plantMesh.receiveShadow = true;

    // FIX 1: Disable frustum culling to prevent disappearance at certain angles
    this.plantMesh.frustumCulled = false;

    this.scene.add(this.plantMesh);

    // Sun Material (Ghost Sun)
    const sunMat = new THREE.MeshBasicMaterial({ color: COLOR_SUN });
    const sunRadius = 4;
    for (let x = -sunRadius; x <= sunRadius; x++) {
      for (let y = -sunRadius; y <= sunRadius; y++) {
        for (let z = -sunRadius; z <= sunRadius; z++) {
          if (Math.sqrt(x * x + y * y + z * z) <= sunRadius) {
            this.sunOffsets.push({ x, y, z });
          }
        }
      }
    }

    this.sunMesh = new THREE.InstancedMesh(geometry, sunMat, this.sunOffsets.length);
    this.sunMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sunMesh.visible = false;
    this.scene.add(this.sunMesh);

    this.dummy = new THREE.Object3D();
    this.raycaster = new THREE.Raycaster();

    // FIX 2: Tolerance for easier selection
    // Casting to any because standard Three types might not strictly define params.Mesh
    (this.raycaster.params as any).Mesh = { threshold: 0.1 };

    this.mouse = new THREE.Vector2(-1, -1);
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public updateSunPosition(x: number, y: number, z: number, intensity: number) {
    this.sunLight.position.set(x, y, z);
    this.sunLight.intensity = intensity;

    let idx = 0;
    for (const offset of this.sunOffsets) {
      this.dummy.position.set(x + offset.x, y + offset.y, z + offset.z);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.sunMesh.setMatrixAt(idx++, this.dummy.matrix);
    }
    this.sunMesh.instanceMatrix.needsUpdate = true;
  }

  public update(garden: Garden) {
    let plantIndex = 0;
    this.instanceIdToKey = []; // Reset mapping array

    // FIX 3: Iterate over entries to get the Map Key (Grid Index) directly
    for (const [key, cell] of garden.grid) {
      if (cell.type === CellType.SUN) {
        continue;
      }

      this.dummy.position.set(cell.x, cell.y, cell.z);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();

      if (plantIndex < MAX_INSTANCES) {
        this.plantMesh.setMatrixAt(plantIndex, this.dummy.matrix);

        let col: THREE.Color | number = 0xFFFFFF;
        switch (cell.type) {
          case CellType.STEM: col = cell.genotype.stemColor; break;
          case CellType.LEAF: col = cell.genotype.leafColor; break;
          case CellType.FLOWER: col = cell.genotype.flowerColor; break;
          case CellType.CRYSTAL: col = COLOR_CRYSTAL; break;
          case CellType.ASH: col = COLOR_ASH; break; // White Legacy
        }
        this.plantMesh.setColorAt(plantIndex, col instanceof THREE.Color ? col : new THREE.Color(col));

        // Store the mapping: Instance ID (plantIndex) -> Grid Key (key)
        this.instanceIdToKey[plantIndex] = key;

        plantIndex++;
      }
    }

    const emptyMatrix = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let i = plantIndex; i < MAX_INSTANCES; i++) {
      this.plantMesh.setMatrixAt(i, emptyMatrix);
    }

    this.plantMesh.count = plantIndex;
    this.plantMesh.instanceMatrix.needsUpdate = true;
    if (this.plantMesh.instanceColor) this.plantMesh.instanceColor.needsUpdate = true;

    // FIX 4: Manually force bounding sphere to cover the entire grid
    // This solves the bug where raycasting misses instances because the base geometry's bounds are too small.
    if (!this.plantMesh.geometry.boundingSphere) {
      this.plantMesh.geometry.boundingSphere = new THREE.Sphere();
    }
    // 100x100x100 grid centered at 50,50,50 with radius covering it
    this.plantMesh.geometry.boundingSphere.set(new THREE.Vector3(50, 50, 50), 100);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public getPlantAt(clientX: number, clientY: number, garden: Garden): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersectPlants = this.raycaster.intersectObject(this.plantMesh);
    if (intersectPlants.length > 0) {
      const targetInstanceId = intersectPlants[0].instanceId;

      if (targetInstanceId !== undefined && this.instanceIdToKey[targetInstanceId] !== undefined) {
        return this.instanceIdToKey[targetInstanceId];
      }
    }
    return null;
  }
}
