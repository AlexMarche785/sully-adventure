import * as THREE from './libs/three.module.js';

// --- Constants ---
const GAME_WIDTH = 800; // Match container width
const GAME_HEIGHT = 600; // Match container height
const ASPECT = GAME_WIDTH / GAME_HEIGHT;
const FRUSTUM_SIZE = 15; // Adjust zoom level
const GRAVITY = -30; // Slightly stronger gravity maybe
const PLAYER_SPEED = 5;
const JUMP_STRENGTH = 10;
const PLATFORM_GENERATION_DISTANCE = FRUSTUM_SIZE * ASPECT; // How far ahead to generate
const PLATFORM_REMOVAL_DISTANCE = -FRUSTUM_SIZE * ASPECT;  // How far behind to remove
const PLAYER_HORIZONTAL_CLAMP = FRUSTUM_SIZE * ASPECT / 4; // Keep player near center

// --- Basic Setup ---
const gameContainer = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x331155); // Deep purple pixel background color

const camera = new THREE.OrthographicCamera(
    FRUSTUM_SIZE * ASPECT / -2, FRUSTUM_SIZE * ASPECT / 2,
    FRUSTUM_SIZE / 2, FRUSTUM_SIZE / -2,
    0.1, 100
);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
gameContainer.appendChild(renderer.domElement);

// --- Texture Loading Helper ---
const textureLoader = new THREE.TextureLoader();

function loadPixelatedTexture(path) {
    const texture = textureLoader.load(path);
    // *** CRITICAL FOR PIXELATED LOOK ***
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

// --- Game Elements ---

// Player (Sully - Pixelated)
const sullyTexture = loadPixelatedTexture('assets/textures/sully_pixel.png');
const sullyMaterial = new THREE.MeshBasicMaterial({
    map: sullyTexture,
    transparent: true,
    color: 0xFFFFFF // Keep texture color pure white unless tinting
});
// Adjust size based on your pixel art resolution / desired game scale
const sullyGeometry = new THREE.PlaneGeometry(1, 1); // Example: 1 unit wide, 1 unit tall
const sullyMesh = new THREE.Mesh(sullyGeometry, sullyMaterial);
sullyMesh.position.set(0, -FRUSTUM_SIZE / 2 + 1, 0);
scene.add(sullyMesh);

const player = {
    mesh: sullyMesh,
    width: 1,
    height: 1,
    velocity: new THREE.Vector2(0, 0),
    isGrounded: false,
    // We track world scroll instead of absolute player position for infinite effect
    worldScrollX: 0
};

// Platforms (Dynamic List)
const activePlatforms = []; // Holds platforms currently in the scene
const platformMaterial = new THREE.MeshBasicMaterial({
    // color: 0x00FF00, // Simple green color if no texture
    map: loadPixelatedTexture('assets/textures/platform_pixel.png'),
    // Make texture repeat if platform geometry is larger than texture
    // map: platformTexture, // Assign texture
});

let lastPlatformX = 0; // Keep track of the position of the last generated platform

// Create the initial ground platform
createPlatform(0, -FRUSTUM_SIZE / 2 + 0.25, FRUSTUM_SIZE * ASPECT * 1.5, 0.5); // Wider start platform

function createPlatform(x, y, width, height) {
    const geometry = new THREE.PlaneGeometry(width, height);

    // Apply texture tiling if needed (adjust repeat based on texture/geometry size)
    // if (geometry.parameters.width > 1) { // Example: if wider than 1 unit
    //   platformMaterial.map.wrapS = THREE.RepeatWrapping;
    //   platformMaterial.map.needsUpdate = true; // Important after changing wrap/repeat
    //   geometry.attributes.uv.array = geometry.attributes.uv.array.map((val, index) =>
    //        index % 2 === 0 ? val * width : val // Repeat U coordinate based on width
    //    );
    // }

    const mesh = new THREE.Mesh(geometry, platformMaterial);
    mesh.position.set(x, y, -0.1); // Position relative to the world origin
    scene.add(mesh);
    const platformData = { mesh, width, height, worldX: x }; // Store original world X
    activePlatforms.push(platformData);
    lastPlatformX = Math.max(lastPlatformX, x + width / 2); // Update the rightmost edge
    return platformData;
}

// --- Platform Management (for Never-Ending World) ---
function managePlatforms(playerWorldX) {
    // 1. Remove platforms far behind the player
    for (let i = activePlatforms.length - 1; i >= 0; i--) {
        const platform = activePlatforms[i];
        const platformRightEdge = platform.worldX + platform.width / 2;
        const removalPoint = playerWorldX + PLATFORM_REMOVAL_DISTANCE; // Based on player's scrolled position

        if (platformRightEdge < removalPoint) {
            console.log("Removing platform at:", platform.worldX);
            scene.remove(platform.mesh); // Remove from scene
            platform.mesh.geometry.dispose(); // Clean up geometry
            // Note: Material is shared, don't dispose unless it's unique per platform
            activePlatforms.splice(i, 1); // Remove from array
        }
    }

    // 2. Generate new platforms ahead of the player
    const generationPoint = playerWorldX + PLATFORM_GENERATION_DISTANCE;
    while (lastPlatformX < generationPoint) {
        // Simple generation logic: place randomly ahead
        const minGap = 1;
        const maxGap = 4;
        const gap = minGap + Math.random() * (maxGap - minGap);

        const minWidth = 2;
        const maxWidth = 5;
        const width = minWidth + Math.random() * (maxWidth - minWidth);

        // Random height, ensure it's reachable from previous platforms
        const minHeight = -FRUSTUM_SIZE / 2 + 1; // Above ground
        const maxHeight = FRUSTUM_SIZE / 2 - 3;  // Below top edge
        const y = minHeight + Math.random() * (maxHeight - minHeight);

        const x = lastPlatformX + gap + width / 2;

        console.log("Generating platform at:", x);
        createPlatform(x, y, width, 0.5); // Create new platform updates lastPlatformX
    }
}


// --- Game Logic ---
const clock = new THREE.Clock();
let moveLeft = false;
let moveRight = false;

// Input Handling (remains mostly the same)
// ... (keydown/keyup listeners as before) ...

// Collision Detection (Needs Adjustment for World Scroll)
function checkPlatformCollision() {
    player.isGrounded = false;
    // Adjust player box based on its current *visual* position
    const playerBox = new THREE.Box3().setFromObject(player.mesh);
    const playerBottom = playerBox.min.y;
    // Player's visual center X (relative to screen center which is ~0)
    const playerVisualCenterX = player.mesh.position.x;

    for (const platform of activePlatforms) {
        const platformBox = new THREE.Box3().setFromObject(platform.mesh); // Uses platform's current visual position
        const platformTop = platformBox.max.y;
        const platformLeft = platformBox.min.x;
        const platformRight = platformBox.max.x;

        // Check horizontal overlap using VISUAL positions
        const horizontalOverlap = playerVisualCenterX > platformLeft - player.width / 2 &&
                                  playerVisualCenterX < platformRight + player.width / 2;

        // Check vertical collision (player falling onto platform)
        if (player.velocity.y <= 0 &&
            playerBottom >= platformTop - 0.1 && // Player bottom slightly above platform top
            playerBottom <= platformTop + 0.2 && // Allow slightly deeper intersection before ground check fails
            horizontalOverlap)
        {
            player.mesh.position.y = platformTop + player.height / 2; // Adjust visual position
            player.velocity.y = 0;
            player.isGrounded = true;
            return; // Stop checking once grounded
        }
    }
}
// Food collision would need similar adjustments if food scrolls


// --- Game Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    // --- Update Logic ---
    let horizontalMovement = 0;
    if (moveLeft) {
        horizontalMovement = -PLAYER_SPEED * deltaTime;
    }
    if (moveRight) {
        horizontalMovement = PLAYER_SPEED * deltaTime;
    }

    // Apply horizontal movement to the *world scroll*
    player.worldScrollX += horizontalMovement;

    // Move the player mesh visually, but clamp it
    player.mesh.position.x += horizontalMovement;
    player.mesh.position.x = THREE.MathUtils.clamp(
        player.mesh.position.x,
        -PLAYER_HORIZONTAL_CLAMP,
        PLAYER_HORIZONTAL_CLAMP
    );

    // Calculate the difference between intended scroll and actual mesh move
    // This is how much the world needs to shift to compensate
    const worldShift = player.worldScrollX - player.mesh.position.x;

    // Update platform visual positions based on the world shift
    activePlatforms.forEach(platform => {
        // Set position relative to the player's current view
        platform.mesh.position.x = platform.worldX - player.worldScrollX;
    });
    // Update food items positions similarly if they scroll

    // Vertical Movement (Gravity)
    player.velocity.y += GRAVITY * deltaTime;
    player.mesh.position.y += player.velocity.y * deltaTime;

    // --- Collision Detection ---
    checkPlatformCollision();
    // checkFoodCollision(); // Needs similar adjustment for world scroll

    // Prevent falling through floor if no platform is hit (use visual position)
    const groundLevel = -FRUSTUM_SIZE / 2 + player.height / 2;
    if (player.mesh.position.y < groundLevel && !player.isGrounded) {
        player.mesh.position.y = groundLevel;
        player.velocity.y = 0;
        player.isGrounded = true;
        // Potentially trigger game over if there was no actual ground platform below
    }

    // --- Platform Management ---
    // Pass the player's effective "world" position for generation/removal checks
    managePlatforms(player.worldScrollX);

    // --- Rendering ---
    // The camera stays fixed, the world moves relative to it
    renderer.render(scene, camera);
}

// Initialize platform generation
managePlatforms(0);

// Start the game loop
animate();