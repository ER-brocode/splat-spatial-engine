import * as THREE from 'three';

export interface CameraControlOptions {
  moveSpeed?: number;
  rotateSpeed?: number;
  dampingFactor?: number;
}

/**
 * 6-DOF Interactive Camera Controls with smooth inertia damping and WASD/Orbit controls.
 */
export class InteractiveControls {
  private camera: THREE.Camera;
  private domElement: HTMLElement | null = null;
  private moveSpeed: number;
  private rotateSpeed: number;
  private dampingFactor: number;

  private isPointerDown: boolean = false;
  private previousPointerPosition: { x: number; y: number } = { x: 0, y: 0 };
  private moveForward: boolean = false;
  private moveBackward: boolean = false;
  private moveLeft: boolean = false;
  private moveRight: boolean = false;
  private moveUp: boolean = false;
  private moveDown: boolean = false;

  private velocity: THREE.Vector3 = new THREE.Vector3();
  private euler: THREE.Euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(camera: THREE.Camera, domElement?: HTMLElement, options?: CameraControlOptions) {
    this.camera = camera;
    this.domElement = domElement ?? null;
    this.moveSpeed = options?.moveSpeed ?? 5.0;
    this.rotateSpeed = options?.rotateSpeed ?? 0.0025;
    this.dampingFactor = options?.dampingFactor ?? 0.08;

    this.euler.setFromQuaternion(this.camera.quaternion);

    if (this.domElement) {
      this.attachListeners(this.domElement);
    }
  }

  public attachListeners(element: HTMLElement): void {
    this.domElement = element;
    element.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    element.addEventListener('wheel', this.onWheel, { passive: true });
  }

  public detachListeners(): void {
    if (this.domElement) {
      this.domElement.removeEventListener('pointerdown', this.onPointerDown);
      this.domElement.removeEventListener('wheel', this.onWheel);
    }
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.isPointerDown = true;
    this.previousPointerPosition = { x: event.clientX, y: event.clientY };
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.isPointerDown) return;

    const deltaX = event.clientX - this.previousPointerPosition.x;
    const deltaY = event.clientY - this.previousPointerPosition.y;

    this.euler.y -= deltaX * this.rotateSpeed;
    this.euler.x -= deltaY * this.rotateSpeed;

    // Clamp pitch between -89 and +89 degrees
    const maxPitch = (Math.PI / 2) - 0.01;
    this.euler.x = Math.max(-maxPitch, Math.min(maxPitch, this.euler.x));

    this.camera.quaternion.setFromEuler(this.euler);

    this.previousPointerPosition = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (): void => {
    this.isPointerDown = false;
  };

  private onWheel = (event: WheelEvent): void => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const zoomStep = event.deltaY * 0.005;
    this.camera.position.addScaledVector(forward, -zoomStep);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'KeyE':
      case 'Space':
        this.moveUp = true;
        break;
      case 'KeyQ':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = true;
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
      case 'KeyE':
      case 'Space':
        this.moveUp = false;
        break;
      case 'KeyQ':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = false;
        break;
    }
  };

  public update(deltaTime: number): void {
    const targetVelocity = new THREE.Vector3();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);

    if (this.moveForward) targetVelocity.add(forward);
    if (this.moveBackward) targetVelocity.sub(forward);
    if (this.moveRight) targetVelocity.add(right);
    if (this.moveLeft) targetVelocity.sub(right);
    if (this.moveUp) targetVelocity.add(up);
    if (this.moveDown) targetVelocity.sub(up);

    if (targetVelocity.lengthSq() > 0) {
      targetVelocity.normalize().multiplyScalar(this.moveSpeed * deltaTime);
    }

    // Apply smooth damping
    this.velocity.lerp(targetVelocity, 1.0 - Math.pow(this.dampingFactor, deltaTime * 60));
    this.camera.position.add(this.velocity);
  }

  public getVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }
}
