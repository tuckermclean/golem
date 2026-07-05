import Phaser from 'phaser'
import Grid from '../game/Grid.js'

// Reuse the same constants from KyeScene
const TILE_SIZE = 43
const GRID_WIDTH = 10
const GRID_HEIGHT = 21

export default class LevelEditorScene extends Phaser.Scene {
  constructor() {
    super('LevelEditorScene')
    this.currentTile = '#' // Default to wall
    this.grid = new Grid()
    this.tileSprites = Array.from({ length: GRID_HEIGHT }, () => Array(GRID_WIDTH).fill(null))
  }

  preload() {
    // Load visual assets
    this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png')
    this.load.image('block', 'https://labs.phaser.io/assets/sprites/block.png')
    this.load.image('wall', 'https://labs.phaser.io/assets/sprites/steelbox.png')
    this.load.image('diamond', 'https://labs.phaser.io/assets/sprites/diamond.png')
    this.load.image('baddie', 'https://labs.phaser.io/assets/sprites/wizball.png')
    this.load.image('memoryhole', 'https://labs.phaser.io/assets/sprites/default.png')
  }

  create() {
    this.scale.resize(650, 932)
    // Set background color
    this.cameras.main.setBackgroundColor('#2d2d2d')

    // Create the grid background
    this.createGrid()
    
    // Create UI elements
    this.createUI()
    
    // Set up input handlers
    this.setupInput()
    
    // Add keyboard shortcuts
    this.setupKeyboardShortcuts()
  }

  createGrid() {
    // Create a graphics object for the grid
    const graphics = this.add.graphics()
    graphics.lineStyle(1, 0x000000, 0.5)

    // Draw vertical lines
    for (let x = 0; x <= GRID_WIDTH; x++) {
      graphics.moveTo(x * TILE_SIZE, 0)
      graphics.lineTo(x * TILE_SIZE, GRID_HEIGHT * TILE_SIZE)
    }

    // Draw horizontal lines
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      graphics.moveTo(0, y * TILE_SIZE)
      graphics.lineTo(GRID_WIDTH * TILE_SIZE, y * TILE_SIZE)
    }

    graphics.strokePath()
  }

  createUI() {
    // Create tile selector buttons
    const tiles = [
      { key: '#', label: 'Wall' },
      { key: 'B', label: 'Block' },
      { key: 'D', label: 'Diamond' },
      { key: '@', label: 'Player' },
      { key: 'H', label: 'Horz Baddie' },
      { key: 'V', label: 'Vert Baddie' },
      { key: 'M', label: 'Memory Hole' },
      { key: 'E', label: 'East Moving Block' },
      { key: 'W', label: 'West Moving Block' },
      { key: 'N', label: 'North Moving Block' },
      { key: 'S', label: 'South Moving Block' },
      { key: ' ', label: 'Empty' }
    ]

    const buttonStyle = {
      fontSize: '16px',
      backgroundColor: '#333',
      color: '#fff',
      padding: { x: 10, y: 5 },
      fixedWidth: 120
    }

    // Add a background panel for the buttons
    const panel = this.add.rectangle(
      GRID_WIDTH * TILE_SIZE + 60,
      GRID_HEIGHT * TILE_SIZE / 2,
      140,
      GRID_HEIGHT * TILE_SIZE,
      0x1a1a1a
    )
    panel.setOrigin(0.5, 0.5)

    // Add title
    this.add.text(
      GRID_WIDTH * TILE_SIZE + 60,
      20,
      'Level Editor',
      { fontSize: '20px', color: '#fff' }
    ).setOrigin(0.5, 0)

    tiles.forEach((tile, index) => {
      const button = this.add.text(
        GRID_WIDTH * TILE_SIZE + 60,
        60 + index * 40,
        `${tile.label} (${tile.key})`,
        buttonStyle
      )
      .setOrigin(0.5, 0)
      .setInteractive()
      .on('pointerdown', () => {
        this.currentTile = tile.key
        this.updateSelectedTile()
      })
    })

    // Add save and play buttons
    const saveButton = this.add.text(
      GRID_WIDTH * TILE_SIZE + 60,
      GRID_HEIGHT * TILE_SIZE - 80,
      'Save Level',
      { ...buttonStyle, backgroundColor: '#2ecc71' }
    )
    .setOrigin(0.5, 0.5)
    .setInteractive()
    .on('pointerdown', () => this.saveLevel())

    const playButton = this.add.text(
      GRID_WIDTH * TILE_SIZE + 60,
      GRID_HEIGHT * TILE_SIZE - 40,
      'Play Level',
      { ...buttonStyle, backgroundColor: '#3498db' }
    )
    .setOrigin(0.5, 0.5)
    .setInteractive()
    .on('pointerdown', () => this.playLevel())

    // Add current tile indicator
    this.selectedTileText = this.add.text(
      GRID_WIDTH * TILE_SIZE + 60,
      GRID_HEIGHT * TILE_SIZE - 120,
      'Selected: Wall (#)',
      { fontSize: '16px', color: '#fff' }
    ).setOrigin(0.5, 0.5)

    // Add instructions
    this.add.text(
      GRID_WIDTH * TILE_SIZE + 60,
      GRID_HEIGHT * TILE_SIZE - 160,
      'Press ESC to return to game',
      { fontSize: '14px', color: '#999' }
    ).setOrigin(0.5, 0.5)
  }

  setupInput() {
    this.input.on('pointerdown', (pointer) => {
      const x = Math.floor(pointer.x / TILE_SIZE)
      const y = Math.floor(pointer.y / TILE_SIZE)
      
      if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
        this.placeTile(x, y)
      }
    })
  }

  setupKeyboardShortcuts() {
    const shortcuts = {
      'ONE': '#',
      'TWO': 'B',
      'THREE': 'D',
      'FOUR': '@',
      'FIVE': 'H',
      'SIX': 'V',
      'SEVEN': 'M',
      'EIGHT': 'E',
      'NINE': 'W',
      'MINUS': 'N',
      'EQUALS': 'S',
      'ZERO': ' '
    }

    this.input.keyboard.on('keydown', (event) => {
      const key = event.key.toUpperCase()
      if (shortcuts[key]) {
        this.currentTile = shortcuts[key]
        this.updateSelectedTile()
      }
    })

    // Add escape key to return to game
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('KyeScene')
    })
  }

  placeTile(x, y) {
    // Remove existing sprite if any
    if (this.tileSprites[y][x]) {
      // If there's an arrow overlay, destroy it too
      if (this.tileSprites[y][x].arrow) {
        this.tileSprites[y][x].arrow.destroy();
      }
      this.tileSprites[y][x].destroy()
      this.tileSprites[y][x] = null
    }

    // Update grid
    this.grid.setEntity(x, y, this.currentTile)

    // Create new sprite if not empty
    if (this.currentTile !== ' ') {
      const sprite = this.add.image(
        x * TILE_SIZE + TILE_SIZE / 2,
        y * TILE_SIZE + TILE_SIZE / 2,
        this.getTileTexture(this.currentTile)
      )
      .setDisplaySize(TILE_SIZE * 0.8, TILE_SIZE * 0.8)
      .setOrigin(0.5)

      // If this is a moving block, add an arrow overlay
      if (['E', 'W', 'N', 'S'].includes(this.currentTile)) {
        let arrowKey = 'arrow-right';
        let angle = 0;
        switch (this.currentTile) {
          case 'E': arrowKey = 'arrow-right'; angle = 0; break;
          case 'W': arrowKey = 'arrow-left'; angle = 180; break;
          case 'N': arrowKey = 'arrow-up'; angle = -90; break;
          case 'S': arrowKey = 'arrow-down'; angle = 90; break;
        }
        // Make sure the arrow texture is loaded (should match game)
        const arrow = this.add.image(
          x * TILE_SIZE + TILE_SIZE / 2,
          y * TILE_SIZE + TILE_SIZE / 2,
          arrowKey
        )
        .setDisplaySize(TILE_SIZE * 0.4, TILE_SIZE * 0.4)
        .setOrigin(0.5)
        .setAngle(angle)
        // Store reference for cleanup
        sprite.arrow = arrow;
      }

      this.tileSprites[y][x] = sprite
    }
  }

  getTileTexture(tile) {
    const textures = {
      '#': 'wall',
      'B': 'block',
      'D': 'diamond',
      '@': 'player',
      'H': 'baddie',
      'V': 'baddie',
      'M': 'memoryhole',
      'E': 'block',
      'W': 'block',
      'N': 'block',
      'S': 'block'
    }
    return textures[tile] || 'wall'
  }

  updateSelectedTile() {
    const labels = {
      '#': 'Wall',
      'B': 'Block',
      'D': 'Diamond',
      '@': 'Player',
      'H': 'Horizontal Baddie',
      'V': 'Vertical Baddie',
      'M': 'Memory Hole',
      'E': 'East Moving Block',
      'W': 'West Moving Block',
      'N': 'North Moving Block',
      'S': 'South Moving Block',
      ' ': 'Empty'
    }
    this.selectedTileText.setText(`Selected: ${labels[this.currentTile]} (${this.currentTile})`)
  }

  saveLevel() {
    // Convert grid to ASCII
    let levelData = ''
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const entity = this.grid.getEntity(x, y)
        // Handle both entity objects and direct tile type strings
        levelData += entity ? (typeof entity === 'string' ? entity : entity.getData('type')) : ' '
      }
      levelData += '\n'
    }

    // Create a blob and download link
    const blob = new Blob([levelData], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'level.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  playLevel() {
    // Save current level to a temporary file
    let levelData = ''
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const entity = this.grid.getEntity(x, y)
        // Handle both entity objects and direct tile type strings
        levelData += entity ? (typeof entity === 'string' ? entity : entity.getData('type')) : ' '
      }
      levelData += '\n'
    }

    // Store the level data in localStorage
    localStorage.setItem('tempLevel', levelData)

    // Switch to game scene
    this.scene.start('KyeScene', { levelData })
  }
} 