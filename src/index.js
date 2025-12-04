import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import Ammo from "ammojs-typed";
import { Tween, Easing, Group } from "@tweenjs/tween.js";

let camera, controls, scene, renderer;
let textureLoader;
const clock = new THREE.Clock();

const mouseCoords = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const ballMaterial = new THREE.MeshPhongMaterial({ color: 0x202020 });

// Mundo físico con Ammo
let physicsWorld;
const gravityConstant = 9.8;
let collisionConfiguration;
let dispatcher;
let broadphase;
let solver;
const margin = 0.05;

// Objetos rígidos
const rigidBodies = [];
const pins = [];

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
//Variables temporales para actualizar transformación en el bucle
let transformAux1;
let tempBtVec3_1;

// Comprobación de si es un dispositivo móvil
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

// Dirección y fuerza
let launchDirection = new THREE.Vector3(0, 0, -1);
let launchPower = 20;
let isAiming = false;
let inputBlocked = false;

// Dirección y fuerza (móviles)
let touchStartY = 0;
let touchPowerStart = 0;

// Grupo de animación
const tweenGroup = new Group();

// Sonidos
let listener;
let pinHitBuffer = null;
let soundDispatcher;

// Inicialización Ammo
Ammo(Ammo).then(start);

function start() {
  //Elementos gráficos
  initGraphics();
  //Elementos del mundo físico
  initPhysics();
  //Objetos
  createObjects();
  //Eventos
  initInput();
  // UI
  createUI();
  // Cargar audio
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load("sound/pins-sound-effect.mp3", function (buffer) {
    pinHitBuffer = buffer;
  });

  animationLoop();
}

function initGraphics() {
  //Cámara, escena, renderer y control de cámara
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.2,
    2000
  );
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd1e5);
  camera.position.set(-14, 8, 16);

  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.update();

  controls.enableRotate = false;
  controls.enableZoom = false;
  controls.enablePan = false;

  textureLoader = new THREE.TextureLoader();

  //Tween de cámara
  new Tween(camera.position, tweenGroup)
    .to(
      {
        x: 0,
        y: 3,
        z: 2,
      },
      800
    )
    .easing(Easing.Cubic.Out)
    .onUpdate(() => {
      controls.update();
    })
    .start();

  // Listener para el audio
  listener = new THREE.AudioListener();
  camera.add(listener);

  //Luces
  const ambientLight = new THREE.AmbientLight(0x707070);
  scene.add(ambientLight);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(-10, 18, 5);
  light.castShadow = true;
  const d = 14;
  light.shadow.camera.left = -d;
  light.shadow.camera.right = d;
  light.shadow.camera.top = d;
  light.shadow.camera.bottom = -d;

  light.shadow.camera.near = 2;
  light.shadow.camera.far = 50;

  light.shadow.mapSize.x = 1024;
  light.shadow.mapSize.y = 1024;

  scene.add(light);
  //Redimensión de la ventana
  window.addEventListener("resize", onWindowResize);
}

function initPhysics() {
  // Configuración Ammo
  // Colisiones
  collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
  // Gestor de colisiones convexas y cóncavas
  dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
  soundDispatcher = dispatcher;
  // Colisión fase amplia
  broadphase = new Ammo.btDbvtBroadphase();
  // Resuelve resricciones de reglas físicas como fuerzas, gravedad, etc.
  solver = new Ammo.btSequentialImpulseConstraintSolver();
  // Crea en mundo físico
  physicsWorld = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfiguration
  );
  // Establece gravedad
  physicsWorld.setGravity(new Ammo.btVector3(0, -gravityConstant, 0));

  transformAux1 = new Ammo.btTransform();
  tempBtVec3_1 = new Ammo.btVector3(0, 0, 0);
}

function createObjects() {
  // Creación del entorno
  createBowlingAlleyEnvironment();
  // Creación de los bolos
  createPins();
}

function createBowlingAlleyEnvironment() {
  const roomWidth = 10;
  const roomLength = 40;
  const roomHeight = 6;

  const room = new THREE.Group();
  scene.add(room);

  const wallMaterial = new THREE.MeshPhongMaterial({
    color: 0xbf9061,
    side: THREE.DoubleSide,
    transparent: false,
    opacity: 1,
  });

  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  // Pared frontal
  pos.set(0, roomHeight / 2, -roomLength / 2);
  quat.set(0, 0, 0, 1);
  room.add(
    createBoxWithPhysics(roomWidth, roomHeight, 1, 0, pos, quat, wallMaterial)
  );

  // Pared trasera
  pos.set(0, roomHeight / 2, roomLength / 2);
  room.add(
    createBoxWithPhysics(roomWidth, roomHeight, 1, 0, pos, quat, wallMaterial)
  );

  // Pared lateral izquierda
  pos.set(-roomWidth / 2, roomHeight / 2, 0);
  quat.set(0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4));
  room.add(
    createBoxWithPhysics(roomLength, roomHeight, 1, 0, pos, quat, wallMaterial)
  );

  // Pared lateral izquierda
  pos.set(roomWidth / 2, roomHeight / 2, 0);
  quat.set(0, Math.sin(-Math.PI / 4), 0, Math.cos(-Math.PI / 4));
  room.add(
    createBoxWithPhysics(roomLength, roomHeight, 1, 0, pos, quat, wallMaterial)
  );

  // Techo
  pos.set(0, roomHeight, 0);
  quat.set(0, 0, 0, 1);
  room.add(
    createBoxWithPhysics(roomWidth, 1, roomLength, 0, pos, quat, wallMaterial)
  );

  // Suelo
  pos.set(0, -0.5, 0);
  quat.set(0, 0, 0, 1);
  const floor = createBoxWithPhysics(
    roomWidth,
    1,
    roomLength,
    0,
    pos,
    quat,
    new THREE.MeshPhongMaterial({ color: 0xffffff })
  );
  floor.receiveShadow = true;

  // Textura del suelo
  textureLoader.load(
    "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/herringbone_parquet/herringbone_parquet_diff_2k.jpg",
    function (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 4);
      floor.material.map = texture;
      floor.material.needsUpdate = true;
    }
  );
}

// Función que crea la forma de los bolos
function createPin() {
  const points = [];
  points.push(new THREE.Vector2(0, 0.0));
  points.push(new THREE.Vector2(0.11, 0.05));
  points.push(new THREE.Vector2(0.13, 0.2));
  points.push(new THREE.Vector2(0.14, 0.4));
  points.push(new THREE.Vector2(0.12, 0.6));
  points.push(new THREE.Vector2(0.1, 0.8));
  points.push(new THREE.Vector2(0.12, 1.0));
  points.push(new THREE.Vector2(0, 1.1));

  const geometry = new THREE.LatheGeometry(points, 32);
  geometry.translate(0, -0.55, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshPhongMaterial({ color: 0xffffff })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Función que crea los bolos
function createPins() {
  const pinMass = 1.5;
  const pinHeight = 1.1;
  const pinRadius = 0.15;
  const baseZ = -17;

  const rows = [
    { count: 4, z: baseZ },
    { count: 3, z: baseZ + 1.1 },
    { count: 2, z: baseZ + 2.2 },
    { count: 1, z: baseZ + 3.3 },
  ];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const offsetX = -(row.count - 1) * 0.35;

    for (let i = 0; i < row.count; i++) {
      const x = offsetX + i * 0.7;
      const y = 0.55;

      const pinMesh = createPin();
      pinMesh.position.set(x, y, row.z);

      const shape = new Ammo.btCylinderShape(
        new Ammo.btVector3(pinRadius, pinHeight * 0.5, pinRadius)
      );

      pos.set(x, y, row.z);
      quat.set(0, 0, 0, 1);
      createRigidBody(pinMesh, shape, pinMass, pos, quat);

      pins.push({
        mesh: pinMesh,
        startPos: pos.clone(),
        startQuat: quat.clone(),
      });
    }
  }
}

function createBoxWithPhysics(sx, sy, sz, mass, pos, quat, material) {
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1),
    material
  );

  //Estructura geométrica de colisión
  //Crea caja orientada en el espacio, especificando dimensiones
  const shape = new Ammo.btBoxShape(
    new Ammo.btVector3(sx * 0.5, sy * 0.5, sz * 0.5)
  );
  shape.setMargin(margin);

  createRigidBody(object, shape, mass, pos, quat);

  return object;
}

//Creación de cuerpo rígido, con masa, sujeto a fuerzas, colisiones...
function createRigidBody(object, physicsShape, mass, pos, quat, vel, angVel) {
  //Posición
  if (pos) {
    object.position.copy(pos);
  } else {
    pos = object.position;
  }

  //Cuaternión, es decir orientación
  if (quat) {
    object.quaternion.copy(quat);
  } else {
    quat = object.quaternion;
  }
  //Matriz de transformación
  const transform = new Ammo.btTransform();
  transform.setIdentity();
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
  transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
  const motionState = new Ammo.btDefaultMotionState(transform);
  //Inercia inicial y parámetros de rozamiento, velocidad
  const localInertia = new Ammo.btVector3(0, 0, 0);
  physicsShape.calculateLocalInertia(mass, localInertia);
  //Crea el cuerpo
  const rbInfo = new Ammo.btRigidBodyConstructionInfo(
    mass,
    motionState,
    physicsShape,
    localInertia
  );
  const body = new Ammo.btRigidBody(rbInfo);

  body.threeObject = object;
  body.setFriction(0.5);

  if (vel) {
    body.setLinearVelocity(new Ammo.btVector3(vel.x, vel.y, vel.z));
  }

  if (angVel) {
    body.setAngularVelocity(new Ammo.btVector3(angVel.x, angVel.y, angVel.z));
  }

  //Enlaza primitiva gráfica con física
  object.userData.physicsBody = body;
  object.userData.collided = false;

  scene.add(object);

  //Si tiene masa
  if (mass > 0) {
    rigidBodies.push(object);
    // Disable deactivation
    body.setActivationState(4);
  }

  //Añadido al universo físico
  physicsWorld.addRigidBody(body);

  return body;
}

function initInput() {
  // Si la entrada es táctil
  if (isTouchDevice) {
    window.addEventListener("touchstart", (event) => {
      if (inputBlocked) return;
      const touch = event.touches[0];
      touchStartY = touch.clientY;
      touchPowerStart = launchPower;
      isAiming = true;
    });

    window.addEventListener("touchmove", (event) => {
      // Evitamos que cuando se pulse el botón se lance una bola y no lanzar si no estábamos apuntando
      if (!isAiming || inputBlocked) return;
      const touch = event.touches[0];
      const dy = touchStartY - touch.clientY;
      launchPower = touchPowerStart + dy * 0.05;
      launchPower = Math.max(5, Math.min(50, launchPower));

      const dx =
        (touch.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      launchDirection.set(dx, 0, -1).normalize();
    });

    window.addEventListener("touchend", (event) => {
      if (inputBlocked) return;
      isAiming = false;
      launchBall();
    });
    // Si no lo es, usa ratón
  } else {
    window.addEventListener("pointerdown", function (event) {
      // Evitamos que cuando se pulse el botón se lance una bola
      if (inputBlocked) return;
      if (event.target.tagName === "BUTTON") return;
      // Ahora esta apuntando
      isAiming = true;
    });

    window.addEventListener("pointerup", (event) => {
      // Evitamos que cuando se pulse el botón se lance una bola
      if (inputBlocked) return;
      if (event.target.tagName === "BUTTON") return;

      // No lanzar si no estábamos apuntando
      if (!isAiming) return;
      isAiming = false;

      launchBall();
    });

    window.addEventListener("pointermove", (event) => {
      // No lanzar si no estábamos apuntando
      if (!isAiming) return;

      //Coordenadas del puntero
      const halfWidth = window.innerWidth / 2;
      const halfHeight = window.innerHeight / 2;

      const dx = (event.clientX - halfWidth) / halfWidth;
      const dz = (event.clientY - halfHeight) / halfHeight;

      launchDirection.set(dx, 0, -1 + dz).normalize();
    });

    // Ajusta la fuerza con la rueda del ratón
    window.addEventListener("wheel", (event) => {
      launchPower += event.deltaY * -0.01;
      launchPower = Math.max(5, Math.min(50, launchPower));
    });
  }
}

function launchBall() {
  // Crea bola como cuerpo rígido y la lanza según coordenadas de ratón
  const ballMass = 35;
  const ballRadius = 0.4;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 14, 10),
    ballMaterial
  );
  ball.castShadow = true;
  ball.receiveShadow = true;

  //Ammo
  //Estructura geométrica de colisión esférica
  const ballShape = new Ammo.btSphereShape(ballRadius);
  ballShape.setMargin(margin);
  pos.copy(camera.position);
  pos.y = 0.5;
  quat.set(0, 0, 0, 1);
  const ballBody = createRigidBody(ball, ballShape, ballMass, pos, quat);

  const velocity = launchDirection.clone().multiplyScalar(launchPower);
  ballBody.setLinearVelocity(
    new Ammo.btVector3(velocity.x, velocity.y, velocity.z)
  );

  // Reproducir sonido
  playPinSound(launchPower);

  // Limpiar la bola después de 10 segundos
  setTimeout(() => {
    if (scene.children.includes(ball)) {
      scene.remove(ball);
      physicsWorld.removeRigidBody(ballBody);
      const idx = rigidBodies.indexOf(ball);
      if (idx !== -1) rigidBodies.splice(idx, 1);
      Ammo.destroy(ballBody);
    }
  }, 10000);
}

function createUI() {
  const infoBox = document.createElement("div");
  infoBox.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    max-width: 210px;
    padding: 8px;
    background-color: rgba(0,0,0,0.7);
    color: #fff;
    font-family: Monospace;
    font-size: 14px;
    border-radius: 4px;
    display: block;
    pointer-events: none;
  `;
  infoBox.innerHTML = `
    <b>Jerónimo Omar Falcón Dávila<b> 
    <hr>
    <u>Ratón (PC)</u><br>
    • Apuntar: Mantén pulsado el botón <b>izquierdo</b> y mueve el ratón.<br>
    • Lanzar: Suelta el botón izquierdo para disparar la bola.<br>
    • Ajustar fuerza: Rueda del ratón (arriba/abajo).<br>
    <br>

    <u>Táctil (móvil / tablet)</u><br>
    • Apuntar: Toca y arrastra (mover horizontal para apuntar).<br>
    • Ajustar fuerza: Desliza hacia arriba/abajo mientras arrastras (arriba = más fuerza).<br>
    • Lanzar: Levanta el dedo para disparar la bola.<br>
    <br>

    <u>Interfaz</u><br>
    • <b>Recoger bolos</b>: pulsa el botón para recolocar los bolos.<br>
    • Las bolas se limpian automáticamente pasados unos segundos o cuando se detienen.<br>
  `;
  document.body.appendChild(infoBox);
  const btn = document.createElement("button");
  btn.textContent = "Recoger bolos";
  btn.style.cssText = `
    position: absolute;
    left: 10px;
    top: 10px;
    display: flex;
    flex-direction: row;
    gap: 8px;
    z-index: 10;
    background-color: rgba(0,0,0,0.4);
    color: #fff;
    border: 1px solid #fff;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-family: Monospace;
    font-size: 14px;
  `;
  btn.onclick = btn.onclick = function (event) {
    event.preventDefault();
    event.stopPropagation();
    resetPins();
  };
  document.body.appendChild(btn);
}

// Resetear los bolos
function resetPins() {
  // Bloquea la entrada mientras se resetea
  inputBlocked = true;
  // Altura donde desaparecen
  const groundY = -2;
  // Tiempo para recreación
  const riseDelay = 800 + pins.length * 50;

  // Bajada y eliminación de los bolos
  pins.forEach((pin, i) => {
    let mesh = pin.mesh;
    // Ya no existe → se recreará luego
    if (!scene.children.includes(mesh)) return;

    const body = mesh.userData.physicsBody;
    if (body) {
      physicsWorld.removeRigidBody(body);
      const idx = rigidBodies.indexOf(mesh);
      if (idx !== -1) rigidBodies.splice(idx, 1);
    }

    // Animación: caer al suelo (desaparecen)
    new Tween(mesh.position, tweenGroup)
      .to({ y: groundY }, 600)
      .delay(i * 60)
      .easing(Easing.Cubic.In)
      .onComplete(() => {
        // Elimina el objeto al tocar suelo
        scene.remove(mesh);
      })
      .start();

    new Tween(mesh.rotation, tweenGroup)
      .to({ x: Math.PI * 2, z: Math.PI }, 600)
      .delay(i * 60)
      .easing(Easing.Cubic.In)
      .start();
  });

  // Reaparición y bajada desde arriba
  setTimeout(() => {
    pins.forEach((pin, index) => {
      let mesh = pin.mesh;

      // Si fue eliminado, se crea de cero
      if (!scene.children.includes(mesh)) {
        mesh = createPin();
        // Los bolos aparecen arriba
        mesh.position.set(pin.startPos.x, pin.startPos.y + 5, pin.startPos.z);
        mesh.quaternion.copy(pin.startQuat);

        const shape = new Ammo.btCylinderShape(
          new Ammo.btVector3(0.15, 0.55, 0.15)
        );
        createRigidBody(mesh, shape, 1.5, mesh.position, mesh.quaternion);

        scene.add(mesh);
        pins[index].mesh = mesh;
      }

      const body = mesh.userData.physicsBody;

      // Reset físico
      const transform = new Ammo.btTransform();
      transform.setIdentity();
      transform.setOrigin(
        new Ammo.btVector3(pin.startPos.x, pin.startPos.y, pin.startPos.z)
      );
      transform.setRotation(
        new Ammo.btQuaternion(
          pin.startQuat.x,
          pin.startQuat.y,
          pin.startQuat.z,
          pin.startQuat.w
        )
      );

      body.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
      body.setAngularVelocity(new Ammo.btVector3(0, 0, 0));
      body.setWorldTransform(transform);

      const motion = body.getMotionState();
      if (motion) motion.setWorldTransform(transform);

      if (!rigidBodies.includes(mesh)) {
        rigidBodies.push(mesh);
        body.setActivationState(4);
      }

      // Animación de bajada suave desde arriba
      mesh.position.set(pin.startPos.x, pin.startPos.y + 5, pin.startPos.z);

      new Tween(mesh.position, tweenGroup)
        .to(
          {
            x: pin.startPos.x,
            y: pin.startPos.y,
            z: pin.startPos.z,
          },
          700
        )
        .easing(Easing.Cubic.Out)
        .onComplete(() => {
          if (index === pins.length - 1) inputBlocked = false;
        })
        .start();

      new Tween(mesh.rotation, tweenGroup)
        .to({ x: 0, y: 0, z: 0 }, 600)
        .easing(Easing.Cubic.Out)
        .start();
    });
  }, riseDelay);
}

function playPinSound(intensity = 1) {
  if (!pinHitBuffer) return;

  const sound = new THREE.Audio(listener);
  sound.setBuffer(pinHitBuffer);
  sound.setVolume(Math.min(intensity / 8, 1));
  sound.play();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animationLoop() {
  requestAnimationFrame(animationLoop);

  const deltaTime = clock.getDelta();
  updatePhysics(deltaTime);

  tweenGroup.update(performance.now());

  renderer.render(scene, camera);
}

function updatePhysics(deltaTime) {
  // Avanza la simulación en función del tiempo
  physicsWorld.stepSimulation(deltaTime, 10);

  // Actualiza cuerpos rígidos
  for (let i = rigidBodies.length - 1; i >= 0; i--) {
    const objThree = rigidBodies[i];
    if (!objThree || !objThree.userData) continue;

    const objPhys = objThree.userData.physicsBody;
    //Obtiene posición y rotación
    const ms = objPhys.getMotionState();
    if (!ms) continue;

    ms.getWorldTransform(transformAux1);

    //Actualiza la correspondiente primitiva gráfica asociada
    const p = transformAux1.getOrigin();
    const q = transformAux1.getRotation();
    objThree.position.set(p.x(), p.y(), p.z());
    objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());

    // Comprobamos si el bolo está tumbado usando el eje "up" de la matriz
    const rotationMatrix = transformAux1.getBasis();
    const upY = rotationMatrix.getRow(1).y();

    // Si está tumbado y ya no se mueve demasiado, eliminarlo
    const linearVel = objPhys.getLinearVelocity();
    const speed = Math.sqrt(
      linearVel.x() ** 2 + linearVel.y() ** 2 + linearVel.z() ** 2
    );

    // Los bolos se eliminan de la escena
    if (Math.abs(upY) < 0.2 && speed < 0.9) {
      scene.remove(objThree);
      physicsWorld.removeRigidBody(objPhys);
      rigidBodies.splice(i, 1);
      Ammo.destroy(objPhys);
    }

    // Las bolas se eliminan de la escena
    if (objThree.geometry.type === "SphereGeometry" && speed < 0.5) {
      scene.remove(objThree);
      physicsWorld.removeRigidBody(objPhys);
      rigidBodies.splice(i, 1);
      Ammo.destroy(objPhys);
    }
  }
}
