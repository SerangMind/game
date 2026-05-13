import * as THREE from "./vendor/three.module.js";

const worldUp = new THREE.Vector3(0, 1, 0);
const tmpVec = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const tmpVecC = new THREE.Vector3();

const BRIDGE = {
  roadY: 76,
  roadWidth: 30,
  pylonTopY: 248,
  pylonConfigs: [
    { u: 0.12, leftSpan: 0.06, rightSpan: 0.18 },
    { u: 0.26, leftSpan: 0.18, rightSpan: 0.33 },
    { u: 0.4, leftSpan: 0.33, rightSpan: 0.46 },
    { u: 0.74, leftSpan: 0.68, rightSpan: 0.81 },
    { u: 0.9, leftSpan: 0.81, rightSpan: 0.96 }
  ],
  islandRange: [0.49, 0.66],
  tunnelSections: [],
  worldRadius: 9800
};

const ROAD_POINTS = [
  new THREE.Vector3(-4500, BRIDGE.roadY, -520),
  new THREE.Vector3(-3600, BRIDGE.roadY, -430),
  new THREE.Vector3(-2650, BRIDGE.roadY, -320),
  new THREE.Vector3(-1750, BRIDGE.roadY, -170),
  new THREE.Vector3(-920, BRIDGE.roadY, -30),
  new THREE.Vector3(-200, BRIDGE.roadY, 85),
  new THREE.Vector3(420, BRIDGE.roadY, 150),
  new THREE.Vector3(980, BRIDGE.roadY, 280),
  new THREE.Vector3(1850, BRIDGE.roadY, 445),
  new THREE.Vector3(2850, BRIDGE.roadY, 620),
  new THREE.Vector3(3880, BRIDGE.roadY, 770),
  new THREE.Vector3(5157, BRIDGE.roadY, 965)
];

const VIEW_NAMES = ["FPV", "추적", "시네마틱 와이드", "오비트"];

const roadCurve = new THREE.CatmullRomCurve3(ROAD_POINTS, false, "catmullrom", 0.15);
roadCurve.arcLengthDivisions = 1000;
const roadLength = roadCurve.getLength();
const laneInnerCenter = 1.7;
const laneOuterCenter = 5.1;
const laneDividerOffsets = [-3.4, 0, 3.4];
const geojeExtensionLength = 1000;
const gadeokExtensionLength = 1000;
const trafficRouteLength = geojeExtensionLength + roadLength + gadeokExtensionLength;

const canvas = document.querySelector("#app");
const statusEl = document.querySelector("#status");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb2c1cb, 0.00016);

const camera = new THREE.PerspectiveCamera(67, window.innerWidth / window.innerHeight, 0.1, 32000);

const droneState = {
  position: new THREE.Vector3(-3200, BRIDGE.roadY + 32, -260),
  velocity: new THREE.Vector3(82, 0, 0),
  yaw: 0,
  pitch: -0.03,
  roll: 0
};

const cameraState = {
  mode: 0,
  orbitAngle: 0,
  pos: new THREE.Vector3()
};

const presetTransition = {
  active: false,
  startPosition: new THREE.Vector3(),
  startVelocity: new THREE.Vector3(),
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  startYaw: 0,
  yaw: 0,
  startPitch: 0,
  pitch: 0,
  startRoll: 0,
  roll: 0,
  viewMode: 0,
  elapsed: 0,
  duration: 0.9
};

const input = {
  throttle: 0,
  ascend: 0,
  yaw: 0,
  boost: false,
  reset: false
};

let pointerLocked = false;
let lookDeltaX = 0;
let lookDeltaY = 0;
let waterNormalMap = null;
let waterMaterial = null;
let traffic = null;
let fpsSmoothing = 60;
let nowSeconds = 0;

const sun = new THREE.DirectionalLight(0xfff1db, 2.05);
sun.position.set(-1100, 1080, 420);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 80;
sun.shadow.camera.far = 5200;
sun.shadow.camera.left = -2400;
sun.shadow.camera.right = 2400;
sun.shadow.camera.top = 1700;
sun.shadow.camera.bottom = -1700;
scene.add(sun);

scene.add(new THREE.HemisphereLight(0xd5e5ef, 0x4d5b65, 0.78));
scene.add(new THREE.AmbientLight(0x9bb3c2, 0.3));

buildSkyDome();
buildWater();
buildTerrain();
buildDistantContext();
buildIslandLabels();
buildGeogaBridge();
buildAtmosphericHaze();
buildNavigationReferenceLights();

applyPreset(2, true);
setViewMode(0);
updateStatus();

canvas.addEventListener("click", () => {
  if (!pointerLocked) {
    canvas.requestPointerLock();
  }
});

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
});

window.addEventListener("mousemove", (event) => {
  if (!pointerLocked) {
    return;
  }
  lookDeltaX += event.movementX;
  lookDeltaY += event.movementY;
});

window.addEventListener("keydown", (event) => onKey(event.code, true));
window.addEventListener("keyup", (event) => onKey(event.code, false));
window.addEventListener("resize", onResize);

const clock = new THREE.Clock();

function animate() {
  const dtRaw = clock.getDelta();
  const dt = Math.min(0.05, dtRaw);
  nowSeconds += dt;
  fpsSmoothing = THREE.MathUtils.lerp(fpsSmoothing, 1 / Math.max(dtRaw, 0.00001), 0.08);

  updateFlight(dt);
  updateCamera(dt);
  updateTraffic(nowSeconds);
  updateWater(nowSeconds);
  updateStatus();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

window.__ggReady = true;
window.__ggDebug = {
  setViewMode,
  jumpToPreset: (id) => applyPreset(id, true),
  getTelemetry: () => ({
    fps: fpsSmoothing,
    position: droneState.position.toArray(),
    velocity: droneState.velocity.toArray(),
    speedMps: droneState.velocity.length(),
    mode: cameraState.mode,
    modeName: VIEW_NAMES[cameraState.mode]
  }),
  setInput: (patch) => {
    if (typeof patch.throttle === "number") input.throttle = THREE.MathUtils.clamp(patch.throttle, -1, 1);
    if (typeof patch.ascend === "number") input.ascend = THREE.MathUtils.clamp(patch.ascend, -1, 1);
    if (typeof patch.yaw === "number") input.yaw = THREE.MathUtils.clamp(patch.yaw, -1, 1);
    if (typeof patch.boost === "boolean") input.boost = patch.boost;
  }
};

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKey(code, isDown) {
  switch (code) {
    case "KeyW":
      input.throttle = isDown ? 1 : input.throttle === 1 ? 0 : input.throttle;
      break;
    case "KeyS":
      input.throttle = isDown ? -1 : input.throttle === -1 ? 0 : input.throttle;
      break;
    case "KeyA":
      input.yaw = isDown ? -1 : input.yaw === -1 ? 0 : input.yaw;
      break;
    case "KeyD":
      input.yaw = isDown ? 1 : input.yaw === 1 ? 0 : input.yaw;
      break;
    case "Space":
      input.ascend = isDown ? 1 : input.ascend === 1 ? 0 : input.ascend;
      break;
    case "ControlLeft":
    case "ControlRight":
      input.ascend = isDown ? -1 : input.ascend === -1 ? 0 : input.ascend;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      input.boost = isDown;
      break;
    case "KeyC":
      if (isDown) {
        setViewMode(cameraState.mode + 1);
      }
      break;
    case "Digit1":
      if (isDown) applyPreset(1);
      break;
    case "Digit2":
      if (isDown) applyPreset(2);
      break;
    case "Digit3":
      if (isDown) applyPreset(3);
      break;
    case "Digit4":
      if (isDown) applyPreset(4);
      break;
    case "KeyR":
      if (isDown) input.reset = true;
      break;
    default:
      break;
  }
}

function updateFlight(dt) {
  if (input.reset) {
    input.reset = false;
    applyPreset(2, true);
    return;
  }

  if (presetTransition.active) {
    if (Math.abs(input.throttle) > 0.01 || Math.abs(input.ascend) > 0.01 || Math.abs(input.yaw) > 0.01) {
      presetTransition.active = false;
    } else {
      updatePresetTransition(dt);
      return;
    }
  }

  const mouseYaw = pointerLocked ? -lookDeltaX * 0.0018 : 0;
  const mousePitch = pointerLocked ? -lookDeltaY * 0.0016 : 0;
  lookDeltaX = 0;
  lookDeltaY = 0;

  const keyboardYaw = input.yaw * 1.2;
  droneState.yaw += (keyboardYaw + mouseYaw) * dt;
  droneState.pitch = THREE.MathUtils.clamp(droneState.pitch + mousePitch, -0.92, 0.72);

  const yawRollTarget = input.yaw * 0.42;
  const mouseRollTarget = THREE.MathUtils.clamp(-mouseYaw * 2.3, -0.44, 0.44);
  droneState.roll = THREE.MathUtils.lerp(droneState.roll, yawRollTarget + mouseRollTarget, 1 - Math.exp(-5.6 * dt));

  const forward = getForwardVector();
  const boostActive = isBoostActive();
  const maxSpeed = boostActive ? 180 : 110;
  const throttleAccel = input.throttle * (boostActive ? 150 : 84);
  const verticalAccel = input.ascend * 52;

  droneState.velocity.addScaledVector(forward, throttleAccel * dt);
  droneState.velocity.y += verticalAccel * dt;
  droneState.velocity.addScaledVector(forward, 10 * dt);
  droneState.velocity.multiplyScalar(Math.exp(-1.35 * dt));

  if (droneState.velocity.length() > maxSpeed) {
    droneState.velocity.setLength(maxSpeed);
  }

  droneState.position.addScaledVector(droneState.velocity, dt);
  droneState.position.y = Math.max(6, droneState.position.y);

  const horizontalDistance = Math.hypot(droneState.position.x, droneState.position.z);
  if (horizontalDistance > BRIDGE.worldRadius) {
    const pull = 1 - BRIDGE.worldRadius / horizontalDistance;
    droneState.position.x *= 1 - pull * 0.18;
    droneState.position.z *= 1 - pull * 0.18;
  }
}

function updateCamera(dt) {
  const forward = getForwardVector();

  if (cameraState.mode === 0) {
    const camPos = tmpVec.copy(droneState.position).addScaledVector(forward, 2.2).addScaledVector(worldUp, 0.9);
    cameraState.pos.lerp(camPos, 1 - Math.exp(-13 * dt));
    camera.position.copy(cameraState.pos);
    camera.lookAt(tmpVecB.copy(droneState.position).addScaledVector(forward, 90));
  } else if (cameraState.mode === 1) {
    const camPos = tmpVec.copy(droneState.position).addScaledVector(forward, -34).addScaledVector(worldUp, 11);
    cameraState.pos.lerp(camPos, 1 - Math.exp(-6.5 * dt));
    camera.position.copy(cameraState.pos);
    camera.lookAt(tmpVecB.copy(droneState.position).addScaledVector(forward, 46));
  } else if (cameraState.mode === 2) {
    const wideOffset = new THREE.Vector3(-110, 44, 110).applyAxisAngle(worldUp, droneState.yaw + 0.34);
    const camPos = tmpVec.copy(droneState.position).add(wideOffset);
    cameraState.pos.lerp(camPos, 1 - Math.exp(-3.8 * dt));
    camera.position.copy(cameraState.pos);
    camera.lookAt(tmpVecB.copy(droneState.position).addScaledVector(forward, 30));
  } else {
    const focus = roadCurve.getPointAt(0.48);
    cameraState.orbitAngle += dt * 0.18;
    const radius = 780;
    const camPos = tmpVec.set(
      focus.x + Math.cos(cameraState.orbitAngle) * radius,
      230 + Math.sin(cameraState.orbitAngle * 0.7) * 34,
      focus.z + Math.sin(cameraState.orbitAngle) * radius
    );
    cameraState.pos.lerp(camPos, 1 - Math.exp(-2.4 * dt));
    camera.position.copy(cameraState.pos);
    camera.lookAt(focus.x, BRIDGE.roadY + 18, focus.z);
  }
}

function setViewMode(mode) {
  cameraState.mode = ((mode % VIEW_NAMES.length) + VIEW_NAMES.length) % VIEW_NAMES.length;
}

function applyPreset(id, immediate = false) {
  const target = buildPresetTarget(id);
  if (!target) {
    return;
  }
  if (immediate) {
    presetTransition.active = false;
    applyTargetState(target);
    return;
  }
  startPresetTransition(target);
}

function buildPresetTarget(id) {
  if (id === 1) {
    return makeRoadPresetTarget(0.16, 16, 20, 74, 0.02, -0.02, 0);
  } else if (id === 2) {
    return makeRoadPresetTarget(0.11, 30, 26, 82, 0.01, -0.03, 1);
  } else if (id === 3) {
    const frame = getRoadFrameAt(0.53, 760, 220);
    return {
      position: frame.position.clone(),
      velocity: frame.tangent.clone().multiplyScalar(getPresetSpeed(28)).addScaledVector(frame.right, -22),
      yaw: frame.yaw - 1.05,
      pitch: -0.22,
      roll: 0,
      viewMode: 2
    };
  } else if (id === 4) {
    const frame = getRoadFrameAt(0.74, -650, 150);
    return {
      position: frame.position.clone(),
      velocity: frame.tangent.clone().multiplyScalar(-getPresetSpeed(24)).addScaledVector(frame.right, 14),
      yaw: frame.yaw + Math.PI - 0.2,
      pitch: -0.16,
      roll: 0,
      viewMode: 3
    };
  }
  return null;
}

function placeDroneOnRoad(u, altitude, lateral, speed, yawOffset, pitch, viewMode) {
  applyTargetState(makeRoadPresetTarget(u, altitude, lateral, speed, yawOffset, pitch, viewMode));
}

function makeRoadPresetTarget(u, altitude, lateral, speed, yawOffset, pitch, viewMode) {
  const frame = getRoadFrameAt(u, lateral, altitude);
  return {
    position: frame.position.clone(),
    velocity: frame.tangent.clone().multiplyScalar(getPresetSpeed(speed)),
    yaw: frame.yaw + yawOffset,
    pitch,
    roll: 0,
    viewMode
  };
}

function startPresetTransition(target) {
  presetTransition.active = true;
  presetTransition.startPosition.copy(droneState.position);
  presetTransition.startVelocity.copy(droneState.velocity);
  presetTransition.startYaw = droneState.yaw;
  presetTransition.startPitch = droneState.pitch;
  presetTransition.startRoll = droneState.roll;
  presetTransition.position.copy(target.position);
  presetTransition.velocity.copy(target.velocity);
  presetTransition.yaw = target.yaw;
  presetTransition.pitch = target.pitch;
  presetTransition.roll = target.roll;
  presetTransition.viewMode = target.viewMode;
  presetTransition.elapsed = 0;
  presetTransition.duration = isBoostActive() ? 0.18 : 1.05;
  setViewMode(target.viewMode);
}

function updatePresetTransition(dt) {
  presetTransition.elapsed += dt;
  const t = THREE.MathUtils.clamp(presetTransition.elapsed / Math.max(presetTransition.duration, 0.001), 0, 1);
  const eased = t * t * (3 - 2 * t);

  droneState.position.copy(presetTransition.startPosition).lerp(presetTransition.position, eased);
  droneState.velocity.copy(presetTransition.startVelocity).lerp(presetTransition.velocity, eased);
  droneState.yaw = presetTransition.startYaw + shortestAngleDelta(presetTransition.startYaw, presetTransition.yaw) * eased;
  droneState.pitch = THREE.MathUtils.lerp(presetTransition.startPitch, presetTransition.pitch, eased);
  droneState.roll = THREE.MathUtils.lerp(presetTransition.startRoll, presetTransition.roll, eased);

  if (t >= 1) {
    applyTargetState(presetTransition);
    presetTransition.active = false;
  }
}

function applyTargetState(target) {
  droneState.position.copy(target.position);
  droneState.velocity.copy(target.velocity);
  droneState.yaw = target.yaw;
  droneState.pitch = target.pitch;
  droneState.roll = target.roll;
  setViewMode(target.viewMode);
  cameraState.pos.copy(droneState.position);
}

function updateStatus() {
  const speed = droneState.velocity.length();
  const alt = droneState.position.y.toFixed(1);
  const fps = fpsSmoothing.toFixed(0);
  const mode = VIEW_NAMES[cameraState.mode];
  statusEl.textContent = `시점: ${mode} | 속도: ${(speed * 3.6).toFixed(1)} km/h | 고도: ${alt} m | FPS: ${fps} 입니다.`;
}

function isBoostActive() {
  return input.boost;
}

function getPresetSpeed(baseSpeed) {
  return baseSpeed * (isBoostActive() ? 1.55 : 1);
}

function shortestAngleDelta(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function getForwardVector() {
  const cp = Math.cos(droneState.pitch);
  return new THREE.Vector3(Math.cos(droneState.yaw) * cp, Math.sin(droneState.pitch), Math.sin(droneState.yaw) * cp).normalize();
}

function getRoadFrameAt(u, lateralOffset = 0, verticalOffset = 0) {
  const t = THREE.MathUtils.clamp(u, 0, 1);
  const center = roadCurve.getPointAt(t);
  const tangent = roadCurve.getTangentAt(t).normalize();
  const right = tmpVecC.crossVectors(tangent, worldUp).normalize().clone();
  const position = center.clone().addScaledVector(right, lateralOffset).addScaledVector(worldUp, verticalOffset);
  return {
    center,
    tangent,
    right,
    position,
    yaw: Math.atan2(tangent.z, tangent.x)
  };
}

function getFrameQuaternion(frame, reverse = false) {
  const forward = reverse ? frame.tangent.clone().multiplyScalar(-1) : frame.tangent.clone();
  const side = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(forward, worldUp, side)
  );
}

function buildSkyDome() {
  const skyGeo = new THREE.SphereGeometry(18000, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x6891b0) },
      horizonColor: { value: new THREE.Color(0xc8d9e4) },
      bottomColor: { value: new THREE.Color(0xecf1f5) }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        float t1 = smoothstep(-0.2, 0.12, h);
        float t2 = smoothstep(0.12, 0.84, h);
        vec3 color = mix(bottomColor, horizonColor, t1);
        color = mix(color, topColor, t2);
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

function buildWater() {
  waterNormalMap = createNoiseTexture(1024, 0.6, 0.74, 0.95);
  waterNormalMap.wrapS = waterNormalMap.wrapT = THREE.RepeatWrapping;
  waterNormalMap.repeat.set(34, 34);

  waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x315f77,
    roughness: 0.2,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    reflectivity: 0.86,
    transmission: 0.28,
    ior: 1.33,
    opacity: 0.95,
    transparent: true,
    normalMap: waterNormalMap,
    normalScale: new THREE.Vector2(0.35, 0.35)
  });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000, 1, 1), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  scene.add(water);
}

function buildTerrain() {
  const coastMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.02
  });
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x6d8167,
    roughness: 0.95,
    metalness: 0
  });
  const tunnelRockMaterial = new THREE.MeshStandardMaterial({
    color: 0xbab59d,
    roughness: 0.97,
    metalness: 0.01
  });
  const tunnelGrassMaterial = new THREE.MeshStandardMaterial({
    color: 0x738564,
    roughness: 0.98,
    metalness: 0
  });

  const geojeFrame = getRoadFrameAt(0.01);
  const jeodoFrame = getRoadFrameAt(0.565);
  const gadeokFrame = getRoadFrameAt(0.99);
  const jeodoShift = jeodoFrame.right.clone().multiplyScalar(-710);

  scene.add(createTerrainPatch(3200, 2600, geojeFrame.center.x - 1020, geojeFrame.center.z - 240, 250, 0.85, coastMaterial));
  scene.add(createTerrainPatch(1900, 1450, geojeFrame.center.x - 700, geojeFrame.center.z - 60, 118, 1.22, grassMaterial));

  scene.add(createTerrainPatch(2000, 1750, jeodoFrame.center.x + 260 + jeodoShift.x, jeodoFrame.center.z + 210 + jeodoShift.z, 188, 1.64, coastMaterial, -10));
  scene.add(createTerrainPatch(1180, 860, jeodoFrame.center.x + 240 + jeodoShift.x, jeodoFrame.center.z + 270 + jeodoShift.z, 104, 2.26, grassMaterial, -6));

  scene.add(createTerrainPatch(2700, 2100, gadeokFrame.center.x + 820, gadeokFrame.center.z + 170, 225, 2.05, coastMaterial, 12));
  scene.add(createTerrainPatch(1500, 1080, gadeokFrame.center.x + 600, gadeokFrame.center.z + 330, 96, 2.84, grassMaterial, 8));

  addGeojeExtensionLandCover(scene, tunnelRockMaterial, tunnelGrassMaterial);
  addTunnelTerrainCovers(scene, tunnelRockMaterial, tunnelGrassMaterial);
}

function buildDistantContext() {
}

function buildIslandLabels() {
  const labels = [
    { text: "거제도", u: 0.0, along: -1080, lateral: -420, y: 320 },
    { text: "저도", u: 0.565, along: 430, lateral: 130, y: 280 },
    { text: "가덕도", u: 1.0, along: 900, lateral: 280, y: 320 }
  ];

  for (const label of labels) {
    const frame = getRoadFrameAt(label.u);
    const sprite = createTextSprite(label.text);
    sprite.position.copy(frame.center)
      .addScaledVector(frame.tangent, label.along)
      .addScaledVector(frame.right, label.lateral)
      .addScaledVector(worldUp, label.y);
    scene.add(sprite);
  }
}

function createTerrainPatch(width, depth, x, z, heightScale, seed, material, yOffset = 0) {
  const geo = new THREE.PlaneGeometry(width, depth, 180, 120);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const shorelineBand = Math.max(170, Math.min(width, depth) * 0.28);
  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const ridge = fbm(vx + x, vz + z, seed);
    const cliff = Math.max(0, Math.sin((vx + seed * 310) * 0.0026) * 0.7);
    const landHeight = Math.max(1.5, ridge * heightScale + cliff * 22);
    const edgeDistance = Math.min(halfWidth - Math.abs(vx), halfDepth - Math.abs(vz));
    const shorelineBlend = THREE.MathUtils.smoothstep(edgeDistance, 0, shorelineBand);
    const outerSink = Math.pow(1 - shorelineBlend, 1.25);
    const submergedHeight = -26 + ridge * 4 - outerSink * 12;
    const height = THREE.MathUtils.lerp(submergedHeight, landHeight, shorelineBlend) + yOffset;
    pos.setY(i, height);

    if (height < 0) {
      const shallowT = THREE.MathUtils.clamp((height + 30) / 30, 0, 1);
      color.setRGB(
        THREE.MathUtils.lerp(0.18, 0.3, shallowT),
        THREE.MathUtils.lerp(0.24, 0.36, shallowT),
        THREE.MathUtils.lerp(0.19, 0.28, shallowT)
      );
    } else {
      const t = THREE.MathUtils.clamp(height / (heightScale + 30), 0, 1);
      color.setRGB(
        THREE.MathUtils.lerp(0.24, 0.58, t),
        THREE.MathUtils.lerp(0.3, 0.54, t),
        THREE.MathUtils.lerp(0.22, 0.42, t)
      );
    }
    colors.push(color.r, color.g, color.b);
  }

  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, 0, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addTunnelTerrainCovers(target, rockMaterial, grassMaterial) {
  for (const section of BRIDGE.tunnelSections) {
    const coverStart = section.coverStart ?? section.start;
    const coverEnd = section.coverEnd ?? section.end;
    const coverSamples = Math.max(20, Math.ceil((coverEnd - coverStart) * 240));
    const coverWidthScale = section.coverWidthScale ?? 1;
    const grassWidthScale = section.grassWidthScale ?? coverWidthScale;
    const coverHeightOffset = section.coverHeightOffset ?? 0;
    const grassHeightOffset = section.grassHeightOffset ?? 0;
    const rockProfile = [
      { x: -56 * coverWidthScale, y: -15 },
      { x: -40 * coverWidthScale, y: -1 },
      { x: -22 * coverWidthScale, y: 8 },
      { x: 0, y: 14 },
      { x: 22 * coverWidthScale, y: 8 },
      { x: 40 * coverWidthScale, y: -1 },
      { x: 56 * coverWidthScale, y: -15 }
    ];
    const grassProfile = [
      { x: -34 * grassWidthScale, y: -4 },
      { x: -16 * grassWidthScale, y: 1.5 },
      { x: 0, y: 4.8 },
      { x: 16 * grassWidthScale, y: 1.5 },
      { x: 34 * grassWidthScale, y: -4 }
    ];

    const lateralOffset = section.coverLateralOffset ?? 0;
    const rock = new THREE.Mesh(
      createSectionProfileGeometry(coverStart, coverEnd, coverSamples, rockProfile, lateralOffset, 18 + coverHeightOffset),
      rockMaterial
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    target.add(rock);

    const grass = new THREE.Mesh(
      createSectionProfileGeometry(coverStart, coverEnd, coverSamples, grassProfile, lateralOffset, 27.5 + grassHeightOffset),
      grassMaterial
    );
    grass.castShadow = true;
    grass.receiveShadow = true;
    target.add(grass);
  }
}

function buildGeogaBridge() {
  const group = new THREE.Group();
  scene.add(group);

  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8ecef,
    roughness: 0.35,
    metalness: 0.22
  });
  const pylonMaterial = new THREE.MeshStandardMaterial({
    color: 0xf9fafc,
    roughness: 0.25,
    metalness: 0.38
  });
  const cableMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.55
  });
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0xd0d6db,
    roughness: 0.86,
    metalness: 0.06
  });
  const laneMarkMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafb,
    emissive: 0x1d2024,
    roughness: 0.18,
    metalness: 0
  });

  addContinuousRoadDeck(group, deckMaterial);
  addRoadBarriers(group, concreteMaterial);
  addLaneMarks(group, laneMarkMaterial);
  addViaductPiers(group, concreteMaterial);
  addTunnelSections(group, concreteMaterial);

  for (const config of BRIDGE.pylonConfigs) {
    addCableStayedPylon(group, config, pylonMaterial, cableMaterial, concreteMaterial);
  }

  addLightPoles(group);
  traffic = createTrafficSystem(group);
}

function addContinuousRoadDeck(group, material) {
  const deck = new THREE.Mesh(createRoadPrismGeometry(BRIDGE.roadWidth, 4.2, 420, 0), material);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const shoulderMat = material.clone();
  shoulderMat.color = new THREE.Color(0xf0f2f4);
  const shoulder = new THREE.Mesh(createRoadPrismGeometry(BRIDGE.roadWidth + 4.8, 1.2, 420, 2.2), shoulderMat);
  shoulder.castShadow = true;
  shoulder.receiveShadow = true;
  group.add(shoulder);

  addGeojeExtensionDeck(group, material, shoulderMat);
  addGadeokExtensionDeck(group, material, shoulderMat);
}

function createRoadPrismGeometry(width, height, samples, yOffset) {
  const positions = [];
  const indices = [];
  const ringSize = 7;
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const bevel = Math.min(width * 0.08, 1.6);
  const crown = Math.min(height * 0.22, 0.48);

  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const frame = getRoadFrameAt(u);
    const center = frame.center.clone().addScaledVector(worldUp, yOffset);
    const profile = [
      { x: -halfWidth, y: -halfHeight },
      { x: -halfWidth, y: halfHeight - bevel * 0.45 },
      { x: -halfWidth + bevel, y: halfHeight },
      { x: 0, y: halfHeight + crown },
      { x: halfWidth - bevel, y: halfHeight },
      { x: halfWidth, y: halfHeight - bevel * 0.45 },
      { x: halfWidth, y: -halfHeight }
    ];

    for (const point of profile) {
      const v = center.clone()
        .addScaledVector(frame.right, point.x)
        .addScaledVector(worldUp, point.y);
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let i = 0; i < samples; i += 1) {
    const a = i * ringSize;
    const b = (i + 1) * ringSize;
    for (let j = 0; j < ringSize; j += 1) {
      const next = (j + 1) % ringSize;
      pushQuad(indices, a + j, b + j, b + next, a + next);
    }
  }

  const startCenterIndex = positions.length / 3;
  const startCenter = getRoadFrameAt(0).center.clone().addScaledVector(worldUp, yOffset);
  positions.push(startCenter.x, startCenter.y, startCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(startCenterIndex, next, i);
  }

  const endCenterIndex = positions.length / 3;
  const endCenter = getRoadFrameAt(1).center.clone().addScaledVector(worldUp, yOffset);
  positions.push(endCenter.x, endCenter.y, endCenter.z);
  const endOffset = samples * ringSize;
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(endCenterIndex, endOffset + i, endOffset + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function addGadeokExtensionDeck(group, deckMaterial, shoulderMaterial) {
  const deck = new THREE.Mesh(createGadeokExtensionRoadGeometry(BRIDGE.roadWidth, 4.2, 88, 0), deckMaterial);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const shoulder = new THREE.Mesh(createGadeokExtensionRoadGeometry(BRIDGE.roadWidth + 4.8, 1.2, 88, 2.2), shoulderMaterial);
  shoulder.castShadow = true;
  shoulder.receiveShadow = true;
  group.add(shoulder);
}

function addGeojeExtensionDeck(group, deckMaterial, shoulderMaterial) {
  const deck = new THREE.Mesh(createGeojeExtensionRoadGeometry(BRIDGE.roadWidth, 4.2, 88, 0), deckMaterial);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const shoulder = new THREE.Mesh(createGeojeExtensionRoadGeometry(BRIDGE.roadWidth + 4.8, 1.2, 88, 2.2), shoulderMaterial);
  shoulder.castShadow = true;
  shoulder.receiveShadow = true;
  group.add(shoulder);
}

function createGeojeExtensionRoadGeometry(width, height, samples, yOffset) {
  const positions = [];
  const indices = [];
  const ringSize = 7;
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const bevel = Math.min(width * 0.08, 1.6);
  const crown = Math.min(height * 0.22, 0.48);

  for (let i = 0; i <= samples; i += 1) {
    const frame = getGeojeExtensionFrame(i / samples);
    const center = frame.position.clone().addScaledVector(worldUp, yOffset);
    const profile = [
      { x: -halfWidth, y: -halfHeight },
      { x: -halfWidth, y: halfHeight - bevel * 0.45 },
      { x: -halfWidth + bevel, y: halfHeight },
      { x: 0, y: halfHeight + crown },
      { x: halfWidth - bevel, y: halfHeight },
      { x: halfWidth, y: halfHeight - bevel * 0.45 },
      { x: halfWidth, y: -halfHeight }
    ];

    for (const point of profile) {
      const v = center.clone()
        .addScaledVector(frame.right, point.x)
        .addScaledVector(frame.normal, point.y);
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let i = 0; i < samples; i += 1) {
    const a = i * ringSize;
    const b = (i + 1) * ringSize;
    for (let j = 0; j < ringSize; j += 1) {
      const next = (j + 1) % ringSize;
      pushQuad(indices, a + j, b + j, b + next, a + next);
    }
  }

  const startCenter = averageGeojeExtensionProfilePoint(0, yOffset);
  const startCenterIndex = positions.length / 3;
  positions.push(startCenter.x, startCenter.y, startCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(startCenterIndex, next, i);
  }

  const endOffset = samples * ringSize;
  const endCenter = averageGeojeExtensionProfilePoint(1, yOffset);
  const endCenterIndex = positions.length / 3;
  positions.push(endCenter.x, endCenter.y, endCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(endCenterIndex, endOffset + i, endOffset + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createGadeokExtensionRoadGeometry(width, height, samples, yOffset) {
  const positions = [];
  const indices = [];
  const ringSize = 7;
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const bevel = Math.min(width * 0.08, 1.6);
  const crown = Math.min(height * 0.22, 0.48);

  for (let i = 0; i <= samples; i += 1) {
    const frame = getGadeokExtensionFrame(i / samples);
    const center = frame.position.clone().addScaledVector(worldUp, yOffset);
    const profile = [
      { x: -halfWidth, y: -halfHeight },
      { x: -halfWidth, y: halfHeight - bevel * 0.45 },
      { x: -halfWidth + bevel, y: halfHeight },
      { x: 0, y: halfHeight + crown },
      { x: halfWidth - bevel, y: halfHeight },
      { x: halfWidth, y: halfHeight - bevel * 0.45 },
      { x: halfWidth, y: -halfHeight }
    ];

    for (const point of profile) {
      const v = center.clone()
        .addScaledVector(frame.right, point.x)
        .addScaledVector(frame.normal, point.y);
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let i = 0; i < samples; i += 1) {
    const a = i * ringSize;
    const b = (i + 1) * ringSize;
    for (let j = 0; j < ringSize; j += 1) {
      const next = (j + 1) % ringSize;
      pushQuad(indices, a + j, b + j, b + next, a + next);
    }
  }

  const startCenter = averageExtensionProfilePoint(0, width, height, yOffset);
  const startCenterIndex = positions.length / 3;
  positions.push(startCenter.x, startCenter.y, startCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(startCenterIndex, next, i);
  }

  const endOffset = samples * ringSize;
  const endCenter = averageExtensionProfilePoint(1, width, height, yOffset);
  const endCenterIndex = positions.length / 3;
  positions.push(endCenter.x, endCenter.y, endCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(endCenterIndex, endOffset + i, endOffset + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function averageExtensionProfilePoint(t, width, height, yOffset) {
  const frame = getGadeokExtensionFrame(t);
  return frame.position.clone().addScaledVector(worldUp, yOffset);
}

function averageGeojeExtensionProfilePoint(t, yOffset) {
  const frame = getGeojeExtensionFrame(t);
  return frame.position.clone().addScaledVector(worldUp, yOffset);
}

function getGeojeExtensionFrame(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const startFrame = getRoadFrameAt(0);
  const horizontalDir = startFrame.tangent.clone().setY(0).normalize().multiplyScalar(-1);
  const finalSlope = Math.tan(THREE.MathUtils.degToRad(15));
  const horizontalDistance = geojeExtensionLength * clamped;
  const verticalDrop = -0.5 * geojeExtensionLength * finalSlope * clamped * clamped;
  const slope = finalSlope * clamped;
  const tangent = horizontalDir.clone().multiplyScalar(1).addScaledVector(worldUp, -slope).normalize();
  const right = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
  const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();
  const position = startFrame.center.clone()
    .addScaledVector(horizontalDir, horizontalDistance)
    .addScaledVector(worldUp, verticalDrop);
  return { position, tangent, right, normal };
}

function getGadeokExtensionFrame(t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const endFrame = getRoadFrameAt(1);
  const horizontalDir = endFrame.tangent.clone().setY(0).normalize();
  const finalSlope = Math.tan(THREE.MathUtils.degToRad(15));
  const horizontalDistance = gadeokExtensionLength * clamped;
  const verticalDrop = -0.5 * gadeokExtensionLength * finalSlope * clamped * clamped;
  const slope = finalSlope * clamped;
  const tangent = horizontalDir.clone().multiplyScalar(1).addScaledVector(worldUp, -slope).normalize();
  const right = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
  const normal = new THREE.Vector3().crossVectors(right, tangent).normalize();
  const position = endFrame.center.clone()
    .addScaledVector(horizontalDir, horizontalDistance)
    .addScaledVector(worldUp, verticalDrop);
  return { position, tangent, right, normal };
}

function getTrafficRouteFrame(distance, dir, lateralOffset = 0, verticalOffset = 0) {
  const wrapped = THREE.MathUtils.euclideanModulo(distance, trafficRouteLength);
  if (dir > 0) {
    if (wrapped <= geojeExtensionLength) {
      const extFrame = getGeojeExtensionFrame(1 - wrapped / geojeExtensionLength);
      return buildTrafficFrame(extFrame.position, extFrame.right, extFrame.normal, extFrame.tangent.clone().multiplyScalar(-1), lateralOffset, verticalOffset);
    }
    if (wrapped <= geojeExtensionLength + roadLength) {
      return buildTrafficFrameFromRoad((wrapped - geojeExtensionLength) / roadLength, 1, lateralOffset, verticalOffset);
    }
    const extFrame = getGadeokExtensionFrame((wrapped - geojeExtensionLength - roadLength) / gadeokExtensionLength);
    return buildTrafficFrame(extFrame.position, extFrame.right, extFrame.normal, extFrame.tangent, lateralOffset, verticalOffset);
  }

  if (wrapped <= gadeokExtensionLength) {
    const extFrame = getGadeokExtensionFrame(1 - wrapped / gadeokExtensionLength);
    return buildTrafficFrame(extFrame.position, extFrame.right, extFrame.normal, extFrame.tangent.clone().multiplyScalar(-1), lateralOffset, verticalOffset);
  }

  if (wrapped <= gadeokExtensionLength + roadLength) {
    const roadDistance = wrapped - gadeokExtensionLength;
    return buildTrafficFrameFromRoad(1 - roadDistance / roadLength, -1, lateralOffset, verticalOffset);
  }

  const extDistance = wrapped - gadeokExtensionLength - roadLength;
  const extFrame = getGeojeExtensionFrame(extDistance / geojeExtensionLength);
  return buildTrafficFrame(extFrame.position, extFrame.right, extFrame.normal, extFrame.tangent, lateralOffset, verticalOffset);
}

function buildTrafficFrameFromRoad(u, dir, lateralOffset = 0, verticalOffset = 0) {
  const base = getRoadFrameAt(u);
  const motionTangent = dir > 0 ? base.tangent.clone() : base.tangent.clone().multiplyScalar(-1);
  const roadNormal = new THREE.Vector3().crossVectors(base.right, base.tangent).normalize();
  return buildTrafficFrame(base.center, base.right, roadNormal, motionTangent, lateralOffset, verticalOffset);
}

function buildTrafficFrame(position, right, normal, tangent, lateralOffset = 0, verticalOffset = 0) {
  const motionTangent = tangent.clone().normalize();
  const laneRight = right.clone().normalize();
  const laneNormal = normal.clone().normalize();
  return {
    position: position.clone()
      .addScaledVector(laneRight, lateralOffset)
      .addScaledVector(laneNormal, verticalOffset),
    tangent: motionTangent,
    right: laneRight,
    normal: laneNormal
  };
}

function getTrafficLaneOffset(dir, laneIndex) {
  const offsets = dir > 0
    ? [laneOuterCenter, laneInnerCenter]
    : [-laneOuterCenter, -laneInnerCenter];
  return offsets[Math.max(0, Math.min(offsets.length - 1, laneIndex))];
}

function createSectionProfileGeometry(uStart, uEnd, samples, profile, lateralOffset = 0, verticalOffset = 0) {
  const positions = [];
  const indices = [];
  const ringSize = profile.length;

  for (let i = 0; i <= samples; i += 1) {
    const u = THREE.MathUtils.lerp(uStart, uEnd, i / samples);
    const frame = getRoadFrameAt(u);
    const center = frame.center.clone()
      .addScaledVector(frame.right, lateralOffset)
      .addScaledVector(worldUp, verticalOffset);

    for (const point of profile) {
      const v = center.clone()
        .addScaledVector(frame.right, point.x)
        .addScaledVector(worldUp, point.y);
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let i = 0; i < samples; i += 1) {
    const a = i * ringSize;
    const b = (i + 1) * ringSize;
    for (let j = 0; j < ringSize; j += 1) {
      const next = (j + 1) % ringSize;
      pushQuad(indices, a + j, b + j, b + next, a + next);
    }
  }

  const startCenter = averageProfilePoint(uStart, profile, lateralOffset, verticalOffset);
  const startCenterIndex = positions.length / 3;
  positions.push(startCenter.x, startCenter.y, startCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(startCenterIndex, next, i);
  }

  const endOffset = samples * ringSize;
  const endCenter = averageProfilePoint(uEnd, profile, lateralOffset, verticalOffset);
  const endCenterIndex = positions.length / 3;
  positions.push(endCenter.x, endCenter.y, endCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(endCenterIndex, endOffset + i, endOffset + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function averageProfilePoint(u, profile, lateralOffset, verticalOffset) {
  const frame = getRoadFrameAt(u);
  const center = frame.center.clone()
    .addScaledVector(frame.right, lateralOffset)
    .addScaledVector(worldUp, verticalOffset);
  let avgX = 0;
  let avgY = 0;
  for (const point of profile) {
    avgX += point.x;
    avgY += point.y;
  }
  avgX /= profile.length;
  avgY /= profile.length;
  return center.addScaledVector(frame.right, avgX).addScaledVector(worldUp, avgY);
}

function pushQuad(indices, a, b, c, d) {
  indices.push(a, b, d, b, c, d);
}

function addRoadBarriers(group, material) {
  const curbMaterial = material.clone();
  curbMaterial.color = new THREE.Color(0xbfc8d0);
  const railProfile = [
    { x: -0.26, y: 0.85 },
    { x: -0.26, y: -0.85 },
    { x: 0.26, y: -0.85 },
    { x: 0.26, y: 0.85 }
  ];
  const curbProfile = [
    { x: -0.52, y: 0.3 },
    { x: -0.52, y: -0.3 },
    { x: 0.52, y: -0.3 },
    { x: 0.52, y: 0.3 }
  ];

  for (const [start, end] of getOpenRoadSections()) {
    const samples = Math.max(40, Math.ceil((end - start) * 380));
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(
        createSectionProfileGeometry(start, end, samples, curbProfile, side * (BRIDGE.roadWidth * 0.5 + 0.65), 2.65),
        curbMaterial
      );
      curb.castShadow = true;
      curb.receiveShadow = true;
      group.add(curb);

      const rail = new THREE.Mesh(
        createSectionProfileGeometry(start, end, samples, railProfile, side * (BRIDGE.roadWidth * 0.5 + 1.22), 4.15),
        material
      );
      rail.castShadow = true;
      rail.receiveShadow = true;
      group.add(rail);
    }
  }

  addGeojeExtensionBarriers(group, material, curbMaterial);
  addGadeokExtensionBarriers(group, material, curbMaterial);
}

function addLaneMarks(group, material) {
  const yellowMaterial = material.clone();
  yellowMaterial.color = new THREE.Color(0xf0d46a);
  yellowMaterial.emissive = new THREE.Color(0x2a220a);

  addMainLaneDivider(group, material, laneDividerOffsets[0], 54);
  addMainLaneDivider(group, material, laneDividerOffsets[2], 54);
  addMainLaneDivider(group, yellowMaterial, -0.22, 72, 6);
  addMainLaneDivider(group, yellowMaterial, 0.22, 72, 6);

  addGeojeExtensionLaneMarks(group, material);
  addGadeokExtensionLaneMarks(group, material);
}

function addMainLaneDivider(group, material, lateralOffset, markCount, markLength = 11) {
  const markGeo = new THREE.BoxGeometry(markLength, 0.05, 0.34);
  const marks = new THREE.InstancedMesh(markGeo, material, markCount);
  const matrix = new THREE.Matrix4();

  let writeIndex = 0;
  for (let i = 0; i < markCount; i += 1) {
    const u = THREE.MathUtils.lerp(0.03, 0.97, i / (markCount - 1));
    if (isInsideTunnel(u, 0.006)) {
      continue;
    }
    const frame = getRoadFrameAt(u, lateralOffset, 2.35);
    const quat = getFrameQuaternion(frame);
    matrix.compose(frame.position, quat, new THREE.Vector3(1, 1, 1));
    marks.setMatrixAt(writeIndex, matrix);
    writeIndex += 1;
  }

  marks.count = writeIndex;
  marks.instanceMatrix.needsUpdate = true;
  group.add(marks);
}

function addGeojeExtensionBarriers(group, railMaterial, curbMaterial) {
  const railProfile = [
    { x: -0.26, y: 0.85 },
    { x: -0.26, y: -0.85 },
    { x: 0.26, y: -0.85 },
    { x: 0.26, y: 0.85 }
  ];
  const curbProfile = [
    { x: -0.52, y: 0.3 },
    { x: -0.52, y: -0.3 },
    { x: 0.52, y: -0.3 },
    { x: 0.52, y: 0.3 }
  ];
  const samples = 72;

  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(
      createGeojeExtensionSectionGeometry(samples, curbProfile, side * (BRIDGE.roadWidth * 0.5 + 0.65), 2.65),
      curbMaterial
    );
    curb.castShadow = true;
    curb.receiveShadow = true;
    group.add(curb);

    const rail = new THREE.Mesh(
      createGeojeExtensionSectionGeometry(samples, railProfile, side * (BRIDGE.roadWidth * 0.5 + 1.22), 4.15),
      railMaterial
    );
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  }
}

function addGeojeExtensionLandCover(target, rockMaterial, grassMaterial) {
  const coverStart = 0.14;
  const coverEnd = 1.0;
  const rockProfile = [
    { x: -112, y: -36 },
    { x: -84, y: -20 },
    { x: -54, y: -4 },
    { x: -26, y: 12 },
    { x: 0, y: 24 },
    { x: 26, y: 12 },
    { x: 54, y: -4 },
    { x: 84, y: -20 },
    { x: 112, y: -36 }
  ];
  const grassProfile = [
    { x: -78, y: -10 },
    { x: -48, y: -1 },
    { x: -24, y: 4.5 },
    { x: 0, y: 8.5 },
    { x: 24, y: 4.5 },
    { x: 48, y: -1 },
    { x: 78, y: -10 }
  ];

  const rock = new THREE.Mesh(
    createGeojeExtensionSectionGeometry(88, rockProfile, 0, 17.5, coverStart, coverEnd),
    rockMaterial
  );
  rock.castShadow = true;
  rock.receiveShadow = true;
  target.add(rock);

  const grass = new THREE.Mesh(
    createGeojeExtensionSectionGeometry(88, grassProfile, 0, 28.5, coverStart, coverEnd),
    grassMaterial
  );
  grass.castShadow = true;
  grass.receiveShadow = true;
  target.add(grass);

  const darkCap = new THREE.Mesh(
    createGeojeExtensionSectionGeometry(2, [
      { x: -34, y: -8.4 },
      { x: -34, y: 9.8 },
      { x: 34, y: 9.8 },
      { x: 34, y: -8.4 }
    ], 0, 3.4, coverStart, coverStart + 0.01),
    new THREE.MeshStandardMaterial({
      color: 0x20262c,
      roughness: 0.94,
      metalness: 0.02
    })
  );
  darkCap.castShadow = false;
  darkCap.receiveShadow = true;
  target.add(darkCap);
}

function addGeojeExtensionLaneMarks(group, material) {
  const yellowMaterial = material.clone();
  yellowMaterial.color = new THREE.Color(0xf0d46a);
  yellowMaterial.emissive = new THREE.Color(0x2a220a);

  addExtensionLaneDivider(group, material, getGeojeExtensionFrame, laneDividerOffsets[0], 20);
  addExtensionLaneDivider(group, material, getGeojeExtensionFrame, laneDividerOffsets[2], 20);
  addExtensionLaneDivider(group, yellowMaterial, getGeojeExtensionFrame, -0.22, 28, 6);
  addExtensionLaneDivider(group, yellowMaterial, getGeojeExtensionFrame, 0.22, 28, 6);
}

function addGadeokExtensionBarriers(group, railMaterial, curbMaterial) {
  const railProfile = [
    { x: -0.26, y: 0.85 },
    { x: -0.26, y: -0.85 },
    { x: 0.26, y: -0.85 },
    { x: 0.26, y: 0.85 }
  ];
  const curbProfile = [
    { x: -0.52, y: 0.3 },
    { x: -0.52, y: -0.3 },
    { x: 0.52, y: -0.3 },
    { x: 0.52, y: 0.3 }
  ];
  const samples = 72;

  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(
      createGadeokExtensionSectionGeometry(samples, curbProfile, side * (BRIDGE.roadWidth * 0.5 + 0.65), 2.65),
      curbMaterial
    );
    curb.castShadow = true;
    curb.receiveShadow = true;
    group.add(curb);

    const rail = new THREE.Mesh(
      createGadeokExtensionSectionGeometry(samples, railProfile, side * (BRIDGE.roadWidth * 0.5 + 1.22), 4.15),
      railMaterial
    );
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  }
}

function addGadeokExtensionLaneMarks(group, material) {
  const yellowMaterial = material.clone();
  yellowMaterial.color = new THREE.Color(0xf0d46a);
  yellowMaterial.emissive = new THREE.Color(0x2a220a);

  addExtensionLaneDivider(group, material, getGadeokExtensionFrame, laneDividerOffsets[0], 20);
  addExtensionLaneDivider(group, material, getGadeokExtensionFrame, laneDividerOffsets[2], 20);
  addExtensionLaneDivider(group, yellowMaterial, getGadeokExtensionFrame, -0.22, 28, 6);
  addExtensionLaneDivider(group, yellowMaterial, getGadeokExtensionFrame, 0.22, 28, 6);
}

function addExtensionLaneDivider(group, material, frameGetter, lateralOffset, markCount, markLength = 11) {
  const markGeo = new THREE.BoxGeometry(markLength, 0.05, 0.34);
  const marks = new THREE.InstancedMesh(markGeo, material, markCount);
  const matrix = new THREE.Matrix4();

  for (let i = 0; i < markCount; i += 1) {
    const t = i / (markCount - 1);
    const frame = frameGetter(0.03 + t * 0.92);
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(frame.tangent.clone(), frame.normal.clone(), frame.right.clone())
    );
    const position = frame.position.clone()
      .addScaledVector(frame.right, lateralOffset)
      .addScaledVector(frame.normal, 2.35);
    matrix.compose(position, quat, new THREE.Vector3(1, 1, 1));
    marks.setMatrixAt(i, matrix);
  }

  marks.instanceMatrix.needsUpdate = true;
  group.add(marks);
}

function createGadeokExtensionSectionGeometry(samples, profile, lateralOffset = 0, verticalOffset = 0) {
  const positions = [];
  const indices = [];
  const ringSize = profile.length;

  for (let i = 0; i <= samples; i += 1) {
    const frame = getGadeokExtensionFrame(i / samples);
    const center = frame.position.clone()
      .addScaledVector(frame.right, lateralOffset)
      .addScaledVector(frame.normal, verticalOffset);

    for (const point of profile) {
      const v = center.clone()
        .addScaledVector(frame.right, point.x)
        .addScaledVector(frame.normal, point.y);
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let i = 0; i < samples; i += 1) {
    const a = i * ringSize;
    const b = (i + 1) * ringSize;
    for (let j = 0; j < ringSize; j += 1) {
      const next = (j + 1) % ringSize;
      pushQuad(indices, a + j, b + j, b + next, a + next);
    }
  }

  const startCenter = averageExtensionSectionPoint(0, profile, lateralOffset, verticalOffset);
  const startCenterIndex = positions.length / 3;
  positions.push(startCenter.x, startCenter.y, startCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(startCenterIndex, next, i);
  }

  const endOffset = samples * ringSize;
  const endCenter = averageExtensionSectionPoint(1, profile, lateralOffset, verticalOffset);
  const endCenterIndex = positions.length / 3;
  positions.push(endCenter.x, endCenter.y, endCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(endCenterIndex, endOffset + i, endOffset + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createGeojeExtensionSectionGeometry(samples, profile, lateralOffset = 0, verticalOffset = 0, startT = 0, endT = 1) {
  const positions = [];
  const indices = [];
  const ringSize = profile.length;

  for (let i = 0; i <= samples; i += 1) {
    const t = THREE.MathUtils.lerp(startT, endT, i / samples);
    const frame = getGeojeExtensionFrame(t);
    const center = frame.position.clone()
      .addScaledVector(frame.right, lateralOffset)
      .addScaledVector(frame.normal, verticalOffset);

    for (const point of profile) {
      const v = center.clone()
        .addScaledVector(frame.right, point.x)
        .addScaledVector(frame.normal, point.y);
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let i = 0; i < samples; i += 1) {
    const a = i * ringSize;
    const b = (i + 1) * ringSize;
    for (let j = 0; j < ringSize; j += 1) {
      const next = (j + 1) % ringSize;
      pushQuad(indices, a + j, b + j, b + next, a + next);
    }
  }

  const startCenter = averageGeojeExtensionSectionPoint(startT, profile, lateralOffset, verticalOffset);
  const startCenterIndex = positions.length / 3;
  positions.push(startCenter.x, startCenter.y, startCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(startCenterIndex, next, i);
  }

  const endOffset = samples * ringSize;
  const endCenter = averageGeojeExtensionSectionPoint(endT, profile, lateralOffset, verticalOffset);
  const endCenterIndex = positions.length / 3;
  positions.push(endCenter.x, endCenter.y, endCenter.z);
  for (let i = 0; i < ringSize; i += 1) {
    const next = (i + 1) % ringSize;
    indices.push(endCenterIndex, endOffset + i, endOffset + next);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function averageExtensionSectionPoint(t, profile, lateralOffset, verticalOffset) {
  const frame = getGadeokExtensionFrame(t);
  let avgX = 0;
  let avgY = 0;
  for (const point of profile) {
    avgX += point.x;
    avgY += point.y;
  }
  avgX /= profile.length;
  avgY /= profile.length;
  return frame.position.clone()
    .addScaledVector(frame.right, lateralOffset + avgX)
    .addScaledVector(frame.normal, verticalOffset + avgY);
}

function averageGeojeExtensionSectionPoint(t, profile, lateralOffset, verticalOffset) {
  const frame = getGeojeExtensionFrame(t);
  let avgX = 0;
  let avgY = 0;
  for (const point of profile) {
    avgX += point.x;
    avgY += point.y;
  }
  avgX /= profile.length;
  avgY /= profile.length;
  return frame.position.clone()
    .addScaledVector(frame.right, lateralOffset + avgX)
    .addScaledVector(frame.normal, verticalOffset + avgY);
}

function addViaductPiers(group, material) {
  for (let u = 0.07; u <= 0.93; u += 0.062) {
    let blocked = false;
    for (const config of BRIDGE.pylonConfigs) {
      if (Math.abs(u - config.u) < 0.035) {
        blocked = true;
        break;
      }
    }
    if (blocked || (u > BRIDGE.islandRange[0] && u < BRIDGE.islandRange[1])) {
      continue;
    }
    if (isInsideTunnel(u, 0.03)) {
      continue;
    }

    const frame = getRoadFrameAt(u);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(worldUp, frame.yaw);
    const height = BRIDGE.roadY - 5;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10.5, height, 8.4), material);
    pier.position.set(frame.center.x, height * 0.5, frame.center.z);
    pier.castShadow = true;
    pier.receiveShadow = true;
    group.add(pier);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(20, 2.3, BRIDGE.roadWidth + 5), material);
    cap.position.copy(frame.center).setY(BRIDGE.roadY - 2.9);
    cap.quaternion.copy(yawQuat);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(18, 4.6, 13), material);
    foot.position.set(frame.center.x, 2.3, frame.center.z);
    foot.castShadow = true;
    foot.receiveShadow = true;
    group.add(foot);
  }
}

function addTunnelSections(group, material) {
  const wallGeo = new THREE.BoxGeometry(18, 10.5, 1.45);
  const roofGeo = new THREE.BoxGeometry(18, 1.35, BRIDGE.roadWidth + 9.5);
  const linerMaterial = new THREE.MeshStandardMaterial({
    color: 0x646d74,
    roughness: 0.74,
    metalness: 0.05
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2329,
    roughness: 0.95,
    metalness: 0.02
  });

  for (const section of BRIDGE.tunnelSections) {
    const lengthU = Math.max(0.001, section.end - section.start);
    const segments = Math.max(3, Math.ceil(lengthU * 95));
    const sectionPitchRad = THREE.MathUtils.degToRad(section.landPitchDeg ?? 0);
    const sectionSink = section.landSink ?? 0;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const u = THREE.MathUtils.lerp(section.start, section.end, t);
      const frame = getRoadFrameAt(u);
      const ease = t * t * (3 - 2 * t);
      const pitchRad = -sectionPitchRad * ease;
      const sinkY = -sectionSink * ease;
      const quat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(frame.tangent.clone(), worldUp.clone(), frame.right.clone())
      );
      if (Math.abs(pitchRad) > 1e-5) {
        quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitchRad));
      }
      const center = frame.center.clone().addScaledVector(worldUp, sinkY);

      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(wallGeo, material);
        wall.position.copy(center).add(
          new THREE.Vector3(0, 3.55, side * (BRIDGE.roadWidth * 0.5 + 3.4)).applyQuaternion(quat)
        );
        wall.quaternion.copy(quat);
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);
      }

      const roof = new THREE.Mesh(roofGeo, material);
      roof.position.copy(center).add(new THREE.Vector3(0, 9.25, 0).applyQuaternion(quat));
      roof.quaternion.copy(quat);
      roof.castShadow = true;
      roof.receiveShadow = true;
      group.add(roof);

      const innerRoof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.7, BRIDGE.roadWidth + 5.8), darkMaterial);
      innerRoof.position.copy(center).add(new THREE.Vector3(0, 8.45, 0).applyQuaternion(quat));
      innerRoof.quaternion.copy(quat);
      group.add(innerRoof);

      for (const side of [-1, 1]) {
        const innerWall = new THREE.Mesh(new THREE.BoxGeometry(17, 8.8, 0.45), linerMaterial);
        innerWall.position.copy(center).add(
          new THREE.Vector3(0, 3.7, side * (BRIDGE.roadWidth * 0.5 + 1.75)).applyQuaternion(quat)
        );
        innerWall.quaternion.copy(quat);
        group.add(innerWall);
      }
    }

    if (section.showStartPortal) {
      addTunnelPortal(group, section.start, material, darkMaterial, 1, section.darkStart ?? true);
    }
    if (section.showEndPortal) {
      addTunnelPortal(group, section.end, material, darkMaterial, -1, section.darkEnd ?? true);
    }
    if (section.sealStart) {
      addTunnelSightBlock(group, section.start, darkMaterial, -1);
    }
    if (section.sealEnd) {
      addTunnelSightBlock(group, section.end, darkMaterial, 1);
    }
  }
}

function addCableStayedPylon(group, config, pylonMaterial, cableMaterial, concreteMaterial) {
  const frame = getRoadFrameAt(config.u);
  const pylon = new THREE.Group();
  pylon.position.set(frame.center.x, 0, frame.center.z);
  const pylonBasis = new THREE.Matrix4().makeBasis(
    frame.tangent.clone(),
    worldUp.clone(),
    frame.right.clone()
  );
  pylon.quaternion.setFromRotationMatrix(pylonBasis);

  const panelOffsetZ = 4.6;
  const addPylonMember = (start, end, width, depth, material) => {
    const delta = end.clone().sub(start);
    const member = new THREE.Mesh(new THREE.BoxGeometry(width, delta.length(), depth), material);
    member.position.copy(start).add(end).multiplyScalar(0.5);
    member.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    member.castShadow = true;
    member.receiveShadow = true;
    pylon.add(member);
    return member;
  };

  const faceOffsetX = 2.9;
  const deckSpread = 11.8;
  const baseSpread = 6.6;
  const submergedBaseY = -4.5;
  const submergedBaseSpread = 4.2;
  for (const faceX of [-faceOffsetX, faceOffsetX]) {
    const upperLeftDeck = new THREE.Vector3(faceX, BRIDGE.roadY - 7.5, -deckSpread);
    const upperLeftTop = new THREE.Vector3(faceX, BRIDGE.pylonTopY - 10, -panelOffsetZ);
    const upperRightDeck = new THREE.Vector3(faceX, BRIDGE.roadY - 7.5, deckSpread);
    const upperRightTop = new THREE.Vector3(faceX, BRIDGE.pylonTopY - 10, panelOffsetZ);

    addPylonMember(upperLeftDeck, upperLeftTop, 3.6, 4.4, pylonMaterial);
    addPylonMember(upperRightDeck, upperRightTop, 3.6, 4.4, pylonMaterial);

    const topCap = new THREE.Mesh(new THREE.BoxGeometry(3.8, 10.5, panelOffsetZ * 2.2), pylonMaterial);
    topCap.position.set(faceX, BRIDGE.pylonTopY - 12.5, 0);
    topCap.castShadow = true;
    topCap.receiveShadow = true;
    pylon.add(topCap);

    const deckKnee = new THREE.Mesh(new THREE.BoxGeometry(3.8, 5.6, deckSpread * 2.04), pylonMaterial);
    deckKnee.position.set(faceX, BRIDGE.roadY - 10.2, 0);
    deckKnee.castShadow = true;
    deckKnee.receiveShadow = true;
    pylon.add(deckKnee);
  }

  addPylonMember(
    new THREE.Vector3(0, submergedBaseY, -submergedBaseSpread),
    new THREE.Vector3(0, BRIDGE.roadY - 7.5, -deckSpread),
    faceOffsetX * 2.8,
    4.6,
    pylonMaterial
  );
  addPylonMember(
    new THREE.Vector3(0, submergedBaseY, submergedBaseSpread),
    new THREE.Vector3(0, BRIDGE.roadY - 7.5, deckSpread),
    faceOffsetX * 2.8,
    4.6,
    pylonMaterial
  );

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(faceOffsetX * 2.6, 6.8, 4.6), pylonMaterial);
  topBeam.position.set(0, BRIDGE.pylonTopY - 12.5, 0);
  topBeam.castShadow = true;
  topBeam.receiveShadow = true;
  pylon.add(topBeam);

  const midBeam = new THREE.Mesh(new THREE.BoxGeometry(faceOffsetX * 2.6, 5.4, 24.6), pylonMaterial);
  midBeam.position.set(0, BRIDGE.roadY - 10.2, 0);
  midBeam.castShadow = true;
  midBeam.receiveShadow = true;
  pylon.add(midBeam);

  const anchorData = [];
  for (const side of [-1, 1]) {
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.1, 4.2), pylonMaterial);
    saddle.position.set(0, BRIDGE.pylonTopY - 11.4, side * panelOffsetZ);
    saddle.castShadow = true;
    saddle.receiveShadow = true;
    pylon.add(saddle);

    const centerLocal = new THREE.Vector3(0, BRIDGE.pylonTopY - 11.4, side * panelOffsetZ);
    const leftLocal = new THREE.Vector3(-2.5, BRIDGE.pylonTopY - 11.4, side * panelOffsetZ);
    const rightLocal = new THREE.Vector3(2.5, BRIDGE.pylonTopY - 11.4, side * panelOffsetZ);
    anchorData.push({ centerLocal, leftLocal, rightLocal });

    for (const dir of [-1, 1]) {
      const anchorArm = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.5, 1.8), pylonMaterial);
      anchorArm.position.set(dir * 1.6, BRIDGE.pylonTopY - 11.4, side * panelOffsetZ);
      anchorArm.castShadow = true;
      anchorArm.receiveShadow = true;
      pylon.add(anchorArm);
    }
  }

  group.add(pylon);
  const anchorWorld = anchorData.map((anchor) => ({
    center: pylon.localToWorld(anchor.centerLocal.clone()),
    left: pylon.localToWorld(anchor.leftLocal.clone()),
    right: pylon.localToWorld(anchor.rightLocal.clone())
  }));
  addCableFan(group, config.u, config.leftSpan, config.rightSpan, cableMaterial, anchorWorld);
}

function addCableFan(group, pylonU, leftSpan, rightSpan, material, anchorWorld) {
  const leftAnchorU = Math.max(leftSpan, pylonU - 0.016);
  const rightAnchorU = Math.min(rightSpan, pylonU + 0.016);
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const anchor = anchorWorld[sideIndex];

    for (let i = 0; i < 6; i += 1) {
      const t = (i + 1) / 7;
      const nearLeft = THREE.MathUtils.lerp(leftSpan, leftAnchorU, t);
      const nearRight = THREE.MathUtils.lerp(rightAnchorU, rightSpan, t);
      const side = sideIndex === 0 ? -1 : 1;
      const leftFrame = getRoadFrameAt(nearLeft, side * (BRIDGE.roadWidth * 0.46), 2.5);
      const rightFrame = getRoadFrameAt(nearRight, side * (BRIDGE.roadWidth * 0.46), 2.5);
      group.add(createCableBetween(anchor.center, leftFrame.position, material));
      group.add(createCableBetween(anchor.center, rightFrame.position, material));
    }
  }
}

function createCableBetween(start, end, material, radius = 0.18) {
  const delta = end.clone().sub(start);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material);
  cable.position.copy(start).add(end).multiplyScalar(0.5);
  cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  cable.castShadow = true;
  cable.receiveShadow = true;
  return cable;
}

function addLightPoles(group) {
  const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 7.4, 8);
  const bulbGeo = new THREE.SphereGeometry(0.22, 8, 8);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xd9e2e8,
    roughness: 0.58,
    metalness: 0.35
  });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff5d8 });

  for (let u = 0.03; u <= 0.97; u += 0.03) {
    if (isInsideTunnel(u, 0.02)) {
      continue;
    }
    const frame = getRoadFrameAt(u);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.copy(frame.center)
        .addScaledVector(frame.right, side * (BRIDGE.roadWidth * 0.5 + 2.1))
        .addScaledVector(worldUp, 6.6);
      pole.castShadow = true;
      group.add(pole);

      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.copy(pole.position).addScaledVector(worldUp, 3.85);
      group.add(bulb);
    }
  }
}

function createTrafficSystem(group) {
  const carCount = 96;
  const carGeo = new THREE.BoxGeometry(1, 1, 1);
  const carMat = new THREE.MeshStandardMaterial({
    color: 0xe9ebed,
    roughness: 0.28,
    metalness: 0.5
  });
  const cars = new THREE.InstancedMesh(carGeo, carMat, carCount);
  cars.castShadow = true;
  cars.receiveShadow = true;
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(cars);

  const headlights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.22, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
    carCount
  );
  headlights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(headlights);

  const taillights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.2, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff422d }),
    carCount
  );
  taillights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(taillights);

  const data = [];
  const carsPerLane = carCount / 4;
  for (const dir of [1, -1]) {
    for (let laneIndex = 0; laneIndex < 2; laneIndex += 1) {
      for (let i = 0; i < carsPerLane; i += 1) {
        data.push({
          laneIndex,
          dir,
          speed:
            laneIndex === 0
              ? 20 + Math.random() * 6
              : 29 + Math.random() * 9,
          phase: (i + Math.random() * 0.16 + laneIndex * 0.11 + (dir < 0 ? 0.05 : 0)) / carsPerLane,
          jitter: (Math.random() - 0.5) * 0.16,
          bodyColor: new THREE.Color().setHSL(Math.random(), 0.18 + Math.random() * 0.15, 0.56 + Math.random() * 0.18)
        });
      }
    }
  }

  return { cars, headlights, taillights, data };
}

function updateTraffic(time) {
  if (!traffic) {
    return;
  }

  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3(4.2, 1.4, 1.8);
  const headScale = new THREE.Vector3(1, 1, 1);
  const minGap = 24;
  const distances = traffic.data.map((t) => t.phase * trafficRouteLength + time * t.speed);
  const adjustedDistances = [...distances];

  for (const dir of [1, -1]) {
    for (let laneIndex = 0; laneIndex < 2; laneIndex += 1) {
      const indices = traffic.data
        .map((t, index) => ({ index, dir: t.dir, laneIndex: t.laneIndex, distance: distances[index] }))
        .filter((entry) => entry.dir === dir && entry.laneIndex === laneIndex)
        .sort((a, b) => b.distance - a.distance);

      for (let i = 1; i < indices.length; i += 1) {
        const leader = indices[i - 1];
        const follower = indices[i];
        adjustedDistances[follower.index] = Math.min(
          adjustedDistances[follower.index],
          adjustedDistances[leader.index] - minGap
        );
      }
    }
  }

  for (let i = 0; i < traffic.data.length; i += 1) {
    const t = traffic.data[i];
    const distance = adjustedDistances[i];
    const frame = getTrafficRouteFrame(distance, t.dir, getTrafficLaneOffset(t.dir, t.laneIndex) + t.jitter, 3.15);
    const quat = getFrameQuaternion(frame);

    matrix.compose(frame.position, quat, scale);
    traffic.cars.setMatrixAt(i, matrix);
    traffic.cars.setColorAt(i, t.bodyColor);

    const headPos = frame.position.clone().addScaledVector(frame.tangent, 1.7).addScaledVector(frame.right, 0.45);
    matrix.compose(headPos, quat, headScale);
    traffic.headlights.setMatrixAt(i, matrix);

    const tailPos = frame.position.clone().addScaledVector(frame.tangent, -1.7).addScaledVector(frame.right, 0.45);
    matrix.compose(tailPos, quat, headScale);
    traffic.taillights.setMatrixAt(i, matrix);
  }

  traffic.cars.instanceMatrix.needsUpdate = true;
  if (traffic.cars.instanceColor) {
    traffic.cars.instanceColor.needsUpdate = true;
  }
  traffic.headlights.instanceMatrix.needsUpdate = true;
  traffic.taillights.instanceMatrix.needsUpdate = true;
}

function buildAtmosphericHaze() {
  const hazeTex = createRadialTexture(512, [255, 255, 255]);
  hazeTex.wrapS = hazeTex.wrapT = THREE.ClampToEdgeWrapping;
  const hazeMat = new THREE.MeshBasicMaterial({
    map: hazeTex,
    color: 0xf3f7fa,
    transparent: true,
    depthWrite: false,
    opacity: 0.15
  });

  for (let i = 0; i < 12; i += 1) {
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(760 + i * 120, 220 + i * 35), hazeMat);
    haze.position.set((Math.random() - 0.5) * 2000, 30 + i * 8, (Math.random() - 0.5) * 1800);
    haze.rotation.x = -Math.PI / 2;
    scene.add(haze);
  }
}

function buildNavigationReferenceLights() {
  const lightGeo = new THREE.SphereGeometry(0.58, 10, 10);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff5d4a });
  for (const { u } of BRIDGE.pylonConfigs) {
    const frame = getRoadFrameAt(u);
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(lightGeo, lightMat);
      light.position.copy(frame.center)
        .addScaledVector(frame.right, side * 10.5)
        .addScaledVector(worldUp, BRIDGE.pylonTopY + 5);
      scene.add(light);
    }
  }
}

function addTunnelPortal(group, u, outerMaterial, innerMaterial, facingDirection, darkenInterior = true) {
  const frame = getRoadFrameAt(u);
  const quat = new THREE.Quaternion().setFromAxisAngle(worldUp, frame.yaw);
  const openingHeight = 8.8;
  const openingHalfWidth = BRIDGE.roadWidth * 0.5 + 1.75;
  const depthOffset = 8 * facingDirection;

  for (const side of [-1, 1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 13.5, 3.8), outerMaterial);
    pier.position.copy(frame.center)
      .addScaledVector(frame.tangent, depthOffset)
      .addScaledVector(frame.right, side * (openingHalfWidth + 1.8))
      .addScaledVector(worldUp, 4.35);
    pier.quaternion.copy(quat);
    pier.castShadow = true;
    pier.receiveShadow = true;
    group.add(pier);
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.1, openingHalfWidth * 2 + 7.2), outerMaterial);
  lintel.position.copy(frame.center)
    .addScaledVector(frame.tangent, depthOffset)
    .addScaledVector(worldUp, openingHeight + 2.55);
  lintel.quaternion.copy(quat);
  lintel.castShadow = true;
  lintel.receiveShadow = true;
  group.add(lintel);

  if (darkenInterior) {
    const voidBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, openingHeight, openingHalfWidth * 2 + 0.4), innerMaterial);
    voidBox.position.copy(frame.center)
      .addScaledVector(frame.tangent, depthOffset + facingDirection * 6)
      .addScaledVector(worldUp, openingHeight * 0.5 + 0.5);
    voidBox.quaternion.copy(quat);
    group.add(voidBox);
  }
}

function addTunnelSightBlock(group, u, material, direction) {
  const frame = getRoadFrameAt(u);
  const quat = new THREE.Quaternion().setFromAxisAngle(worldUp, frame.yaw);
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(14, 9.4, BRIDGE.roadWidth + 4), material);
  blocker.position.copy(frame.center)
    .addScaledVector(frame.tangent, direction * 28)
    .addScaledVector(worldUp, 5.2);
  blocker.quaternion.copy(quat);
  group.add(blocker);
}

function isInsideTunnel(u, padding = 0) {
  return BRIDGE.tunnelSections.some((section) => u > section.start - padding && u < section.end + padding);
}

function getOpenRoadSections() {
  const sections = [];
  let cursor = 0;
  for (const tunnel of BRIDGE.tunnelSections) {
    if (tunnel.start > cursor) {
      sections.push([cursor, tunnel.start]);
    }
    cursor = tunnel.end;
  }
  if (cursor < 1) {
    sections.push([cursor, 1]);
  }
  return sections.filter(([start, end]) => end - start > 0.002);
}

function createTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(12, 18, 24, 0.45)";
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(24, 34, 464, 120, 22);
    ctx.fill();
  } else {
    ctx.fillRect(24, 34, 464, 120);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 3;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(24, 34, 464, 120, 22);
    ctx.stroke();
  } else {
    ctx.strokeRect(24, 34, 464, 120);
  }
  ctx.fillStyle = "#f5fbff";
  ctx.font = "700 112px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.53);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(480, 180, 1);
  return sprite;
}

function fbm(x, z, seed) {
  let value = 0;
  let amp = 0.65;
  let freq = 0.0012;
  for (let i = 0; i < 5; i += 1) {
    value += amp * Math.sin((x + seed * 121) * freq) * Math.cos((z - seed * 91) * freq * 1.37);
    amp *= 0.52;
    freq *= 2.03;
  }
  return value;
}

function createNoiseTexture(size, r, g, b) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const imageData = ctx.createImageData(size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const noise = Math.floor(128 + (Math.random() - 0.5) * 84);
    imageData.data[i + 0] = Math.min(255, noise * r);
    imageData.data[i + 1] = Math.min(255, noise * g);
    imageData.data[i + 2] = Math.min(255, noise * b);
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(c);
}

function createRadialTexture(size, rgb) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const gradient = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
  gradient.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.36)`);
  gradient.addColorStop(0.65, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.11)`);
  gradient.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function updateWater(time) {
  if (!waterNormalMap || !waterMaterial) {
    return;
  }
  waterNormalMap.offset.x = (time * 0.01) % 1;
  waterNormalMap.offset.y = (time * 0.006) % 1;
  waterMaterial.roughness = 0.19 + Math.sin(time * 0.22) * 0.02;
}
