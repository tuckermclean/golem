import Phaser from 'phaser'
import KyeScene from './scenes/KyeScene.js'
import HUDScene from './scenes/HUDScene.js'
import LevelEditorScene from './scenes/LevelEditorScene.js'

// Phaser game configuration object
// Sets up the game canvas, physics, and scenes
const config = {
  type: Phaser.AUTO, // Use WebGL if available, otherwise fall back to Canvas

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 650, // Base width (game + editor panel)
    height: 932 // Base height
  },

  parent: 'game-container', // Attach the canvas to the #game-container div in index.html

  backgroundColor: '#2d2d2d', // Dark gray background

  physics: {
    default: 'arcade', // Use Arcade Physics engine (lightweight and easy to use)
    arcade: {
      gravity: { y: 0 }, // Disable gravity (we're using grid logic, not falling)
      debug: false       // Set to true to show collision boxes for debugging
    }
  },

  // List of scenes to load: main game logic and HUD overlay
  scene: [KyeScene, HUDScene, LevelEditorScene]
}

// Create and launch a new Phaser game using the config above
window.game = new Phaser.Game(config)

// Remove manual resize event listeners. Phaser's scale manager handles scaling in FIT mode.
// For best results, ensure your HTML/CSS includes:
// html, body, #game-container, canvas {
//   width: 100vw;
//   height: 100vh;
//   margin: 0;
//   padding: 0;
//   display: block;
//   touch-action: none;
// }
