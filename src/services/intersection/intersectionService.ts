import { DefaultEventEmitter, Events } from '@/events';
import * as THREE from 'three';

/**
 * Service for calculating intersections between a ray and a morphed geometry.
 */
export class IntersectionService {
  private raycaster = new THREE.Raycaster();
  private mousePosition = new THREE.Vector2();
  private mouseEntered = false;
  private mousePositionChanged = false;

  private camera?: THREE.Camera;
  private originGeometry?: THREE.BufferGeometry;
  private destinationGeometry?: THREE.BufferGeometry;
  private progress: number = 0;
  private intersectionMesh = new THREE.Mesh();

  private geometryNeedsUpdate: boolean;
  private eventEmitter: EventEmitter<Events>;

  private blendedGeometry?: THREE.BufferGeometry;
  private intersection?: THREE.Vector4;

  private lastKnownOriginMeshID?: string;
  private lastKnownDestinationMeshID?: string;

  /**
   * Creates a new IntersectionService instance.
   * @param eventEmitter The event emitter used for emitting events.
   * @param camera The camera used for raycasting.
   * @param originGeometry The origin geometry.
   * @param destinationGeometry The destination geometry.
   */
  constructor(eventEmitter: DefaultEventEmitter, camera?: THREE.Camera, originGeometry?: THREE.BufferGeometry, destinationGeometry?: THREE.BufferGeometry) {
    this.camera = camera;
    this.originGeometry = originGeometry;
    this.eventEmitter = eventEmitter;
    this.destinationGeometry = destinationGeometry;
    this.geometryNeedsUpdate = true;
  }

  /**
   * Set the camera used for raycasting.
   * @param camera
   */
  setCamera(camera: THREE.Camera) {
    this.camera = camera;
  }

  /**
   * Set the origin geometry.
   * @param source
   */
  setOriginGeometry(source: THREE.Mesh) {
    if (this.lastKnownOriginMeshID === source.uuid) return;
    // dispose the previous geometry
    if (this.originGeometry) this.originGeometry.dispose();

    this.lastKnownOriginMeshID = source.uuid;
    // we need to clone the geometry because we are going to modify it.
    this.originGeometry = source.geometry.clone();
    this.originGeometry.applyMatrix4(source.matrixWorld);
    this.geometryNeedsUpdate = true;
  }

  /**
   * Set the destination geometry.
   * @param source
   */
  setDestinationGeometry(source: THREE.Mesh) {
    if (this.lastKnownDestinationMeshID === source.uuid) return;
    // dispose the previous geometry
    if (this.destinationGeometry) this.destinationGeometry.dispose();

    this.lastKnownDestinationMeshID = source.uuid;
    // we need to clone the geometry because we are going to modify it.
    this.destinationGeometry = source.geometry.clone();
    this.destinationGeometry.applyMatrix4(source.matrixWorld);
    this.geometryNeedsUpdate = true;
  }

  /**
   * Set the progress of the morphing animation.
   * @param progress
   */
  setProgress(progress: number) {
    this.progress = progress;
    this.geometryNeedsUpdate = true;
  }

  /**
   * Set the mouse position.
   * @param mousePosition
   */
  setMousePosition(mousePosition?: THREE.Vector2Like) {
    if (mousePosition) {
      if (!this.mousePosition.equals(mousePosition)) {
        this.mousePosition.copy(mousePosition);
        this.mousePositionChanged = true;
      }
      this.mouseEntered = true;
    } else {
      this.mouseEntered = false;
      this.mousePositionChanged = false;
    }
  }

  /**
   * Calculate the intersection.
   * @returns The intersection point or undefined if no intersection was found.
   */
  calculate(): THREE.Vector4 | undefined {
    if (!this.camera) return;
    if (!this.mouseEntered) return;

    if (this.geometryNeedsUpdate) {
      this.geometryNeedsUpdate = false;
      this.blendedGeometry = this.getBlendedGeometry();
      this.mousePositionChanged = true;
    }

    if (this.mousePositionChanged) {
      this.mousePositionChanged = false;
      if (this.blendedGeometry) {
        this.intersection = this.getFirstIntersection(this.blendedGeometry, this.camera);
      } else {
        this.intersection = undefined;
      }
    }

    if (this.intersection) {
      this.eventEmitter.emit('interactionPositionUpdated', { position: this.intersection });
    } else {
      this.eventEmitter.emit('interactionPositionUpdated', { position: { x: 0, y: 0, z: 0, w: 0 } });
    }

    return this.intersection;
  }

  /**
   * Dispose the resources used by the IntersectionService.
   */
  dispose() {
    this.blendedGeometry?.dispose();
    this.intersectionMesh.geometry.dispose();
  }

  private getFirstIntersection(geometry: THREE.BufferGeometry, camera: THREE.Camera) {
    this.raycaster.setFromCamera(this.mousePosition, camera);
    this.intersectionMesh.geometry = geometry;
    const intersection = this.raycaster.intersectObject(this.intersectionMesh, false)[0];
    if (intersection) {
      return new THREE.Vector4(intersection.point.x, intersection.point.y, intersection.point.z, 1);
    }
  }

  private getBlendedGeometry() {
    if (this.progress === 0) {
      return this.originGeometry;
    }
    if (this.progress === 1) {
      return this.destinationGeometry;
    }

    if (!this.originGeometry || !this.destinationGeometry) {
      return;
    }

    if (this.originGeometry === this.destinationGeometry) {
      // if same, just return one of them
      return this.originGeometry;
    }

    return this.blendGeometry(this.originGeometry, this.destinationGeometry, this.progress);
  }

  private blendGeometry(from: THREE.BufferGeometry, to: THREE.BufferGeometry, progress: number): THREE.BufferGeometry {
    const blended = new THREE.BufferGeometry();
    const originPositions = from.attributes.position.array;
    const destinationPositions = to.attributes.position.array;
    const blendedPositions = new Float32Array(originPositions.length);

    for (let i = 0; i < originPositions.length; i += 3) {
      const originVert = new THREE.Vector3(originPositions[i], originPositions[i + 1], originPositions[i + 2]);
      const destinationVert = new THREE.Vector3(destinationPositions[i], destinationPositions[i + 1], destinationPositions[i + 2]);
      const blendedVert = new THREE.Vector3().lerpVectors(originVert, destinationVert, progress);

      blendedPositions[i] = blendedVert.x;
      blendedPositions[i + 1] = blendedVert.y;
      blendedPositions[i + 2] = blendedVert.z;
    }

    blended.setAttribute('position', new THREE.BufferAttribute(blendedPositions, 3));

    if (from.attributes.normal) blended.setAttribute('normal', from.attributes.normal.clone());
    if (from.attributes.uv) blended.setAttribute('uv', from.attributes.uv.clone());
    if (from.index) blended.setIndex(from.index.clone());

    return blended;
  }
}
