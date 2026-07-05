import Phaser from 'phaser'
import Grid from '../game/Grid.js'

// --- Game Constants ---
const TILE_SIZE = 43        // Size of one tile/grid cell in pixels
const GRID_WIDTH = 10       // Number of columns in the grid
const GRID_HEIGHT = 21      // Number of rows in the grid
const MOVE_DURATION = 200   // Base duration for movement tweens (ms)

export default class KyeScene extends Phaser.Scene {
  constructor() {
    super('KyeScene')
    this.moving = false // Movement lock to prevent overlapping inputs
    this.score = 0      // Player's score
    this.health = 20   // Player's health
    this.diamonds = []  // Array to keep track of diamond sprites
    this.hasRequestedFullscreen = false // Track if fullscreen has been requested
    this.swipeStart = null // For swipe gesture detection
    this.lastHorzDir = 0 // -1 for left, 1 for right, 0 for up/down
    this.levelComplete = false // Track if level is complete
    this.currentLevel = 1
    this.movingBlocks = [] // Array to keep track of moving blocks
    
    // Track key press times for diagonal movement
    this.keyPressTimes = {
      up: 0,
      down: 0,
      left: 0,
      right: 0
    }
    this.diagonalThreshold = 150 // Time window in ms for diagonal movement
  }

  preload() {
    // Load visual assets
    this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png')
    this.load.image('block', 'https://labs.phaser.io/assets/sprites/block.png')
    this.load.image('wall', 'https://labs.phaser.io/assets/sprites/steelbox.png')
    this.load.image('diamond', 'https://labs.phaser.io/assets/sprites/diamond.png')
    this.load.image('baddie', 'https://labs.phaser.io/assets/sprites/wizball.png')
    this.load.image('memoryhole', 'https://labs.phaser.io/assets/sprites/default.png')
    // Load arrow textures for moving blocks
    this.load.image('arrow-right', 'https://labs.phaser.io/assets/sprites/arrow.png')
    this.load.image('arrow-left', 'https://labs.phaser.io/assets/sprites/arrow.png')
    this.load.image('arrow-up', 'https://labs.phaser.io/assets/sprites/arrow.png')
    this.load.image('arrow-down', 'https://labs.phaser.io/assets/sprites/arrow.png')
    // Load sound effects
    this.load.audio('diamond-ping', 'assets/audio/p-ping.mp3')
    this.load.audio('explode', 'assets/audio/explode.wav')
    this.load.audio('hit', 'assets/audio/hit.wav')
    this.load.audio('player_death', 'assets/audio/player_death.wav')
    this.load.audio('level_complete', 'assets/audio/escape.wav')
    this.load.audio('drag', 'assets/audio/drag.wav')
    this.load.audio('drag_long', 'assets/audio/drag_long.wav')
  }

  async create() {
    this.scale.resize(430, 932)
    // Initialize level complete flag
    this.levelComplete = false

    // Clear arrays
    this.baddies = []
    this.diamonds = []
    this.memoryHoles = []

    // Set up grid
    this.grid = new Grid()

    // Enable arrow key input for desktop (must be before loader)
    this.cursors = this.input.keyboard.createCursorKeys()

    // Add editor shortcut
    this.input.keyboard.on('keydown-E', () => {
      this.scene.start('LevelEditorScene')
    })

    // Load and build the level from ASCII file
    await this.loadLevelFromFile(`levels/${String(this.currentLevel).padStart(3, '0')}.txt`)

    // After level is built, start moving blocks
    for (const block of this.movingBlocks) {
      this.startMovingBlock(block)
    }

    // Enable swipe input for mobile
    this.input.on('pointerdown', (pointer) => {
      this.swipeStart = { x: pointer.x, y: pointer.y };
    });
    this.input.on('pointerup', (pointer) => {
      if (!this.swipeStart) return;
      const dx = pointer.x - this.swipeStart.x;
      const dy = pointer.y - this.swipeStart.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let moveX = 0, moveY = 0;
      
      // Minimum distance thresholds
      const minCardinalDistance = 20;  // For up/down/left/right
      const minDiagonalDistance = 35;  // For diagonal moves
      
      if (absDx > minCardinalDistance || absDy > minCardinalDistance) {
        // Calculate the angle of the swipe
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Determine if the swipe is diagonal
        const isDiagonal = Math.abs(angle) % 90 > 22.5 && Math.abs(angle) % 90 < 67.5;
        
        // For diagonal moves, require longer distance
        if (isDiagonal && (absDx < minDiagonalDistance || absDy < minDiagonalDistance)) {
          // If diagonal distance is too short, treat as cardinal movement
          if (absDx > absDy) {
            moveX = dx > 0 ? 1 : -1;
          } else {
            moveY = dy > 0 ? 1 : -1;
          }
        } else {
          // Normal movement detection
          if (angle >= -22.5 && angle < 22.5) {
            moveX = 1;  // Right
          } else if (angle >= 22.5 && angle < 67.5) {
            moveX = 1; moveY = 1;  // Down-Right
          } else if (angle >= 67.5 && angle < 112.5) {
            moveY = 1;  // Down
          } else if (angle >= 112.5 && angle < 157.5) {
            moveX = -1; moveY = 1;  // Down-Left
          } else if (angle >= 157.5 || angle < -157.5) {
            moveX = -1;  // Left
          } else if (angle >= -157.5 && angle < -112.5) {
            moveX = -1; moveY = -1;  // Up-Left
          } else if (angle >= -112.5 && angle < -67.5) {
            moveY = -1;  // Up
          } else if (angle >= -67.5 && angle < -22.5) {
            moveX = 1; moveY = -1;  // Up-Right
          }
        }
        
        this.tryMove(moveX, moveY)
        if (!this.hasRequestedFullscreen) {
          this.requestFullscreen()
          this.hasRequestedFullscreen = true
        }
      }
      this.swipeStart = null;
    });

    // Ensure HUD is always on top
    this.scene.launch('HUDScene')
    this.scene.bringToTop('HUDScene')
    this.events.on('requestHUDSync', () => {
      this.events.emit('updateScore', this.score)
      this.events.emit('updateHealth', this.health)
    })

    // For baddie-player collision cooldown
    this.baddieHurtCooldown = 0
    // For baddie movement timing
    this.baddieMoveTimer = 0

    // Unlock audio on first user interaction (for browser compatibility)
    this.input.once('pointerdown', () => {
      if (this.sound.locked) this.sound.unlock();
    });
    this.input.keyboard.once('keydown', () => {
      if (this.sound.locked) this.sound.unlock();
    });
  }

  // --- Utility to request fullscreen mode (for mobile immersion) ---
  requestFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) { /* Safari */
      elem.webkitRequestFullscreen();
    }
  }

  // --- Add a static wall tile at (x, y) ---
  addWall(x, y) {
    const wall = this.physics.add
      .staticImage(x * TILE_SIZE, y * TILE_SIZE, 'wall')
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setOrigin(0)
    wall.type = 'wall'
    this.grid.setEntity(x, y, wall)
  }

  // --- Add a pushable block at (x, y) ---
  addBlock(x, y) {
    const block = this.physics.add
      .image(x * TILE_SIZE, y * TILE_SIZE, 'block')
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setOrigin(0)
    block.body.setImmovable(true)
    block.setData('type', 'block')
    block.gridX = x
    block.gridY = y
    this.grid.setEntity(x, y, block)
    return block
  }

  // --- Add a diamond at (x, y) ---
  // Diamonds are pushable like blocks, but are picked up if the player steps onto them
  addDiamond(x, y) {
    const diamond = this.physics.add
      .image(x * TILE_SIZE, y * TILE_SIZE, 'diamond')
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setOrigin(0)
    diamond.setData('type', 'diamond')
    diamond.gridX = x
    diamond.gridY = y
    this.grid.setEntity(x, y, diamond)
    this.diamonds.push(diamond)
    return diamond
  }

  // --- Add the player character at (x, y) ---
  addPlayer(x, y) {
    const player = this.physics.add
      .image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE, 'player') // start centered
      .setDisplaySize(TILE_SIZE * 0.675, TILE_SIZE)
      .setOrigin(0.5, 0) // Centered origin
    player.setData('type', 'player')
    player.gridX = x
    player.gridY = y
    return player
  }

  // --- Main game loop — handles input and initiates movement ---
  update(time, delta) {
    // Pause all movement if level is complete
    if (this.levelComplete) return
    // Handle player input only if not moving
    if (!this.moving) {
      let dx = 0, dy = 0
      
      // Update key press times
      if (this.cursors.up.isDown) this.keyPressTimes.up = time
      if (this.cursors.down.isDown) this.keyPressTimes.down = time
      if (this.cursors.left.isDown) this.keyPressTimes.left = time
      if (this.cursors.right.isDown) this.keyPressTimes.right = time
      
      // Check for diagonal movement within time threshold
      const isDiagonal = (time - this.keyPressTimes.up < this.diagonalThreshold && 
                         (time - this.keyPressTimes.left < this.diagonalThreshold || 
                          time - this.keyPressTimes.right < this.diagonalThreshold)) ||
                        (time - this.keyPressTimes.down < this.diagonalThreshold && 
                         (time - this.keyPressTimes.left < this.diagonalThreshold || 
                          time - this.keyPressTimes.right < this.diagonalThreshold))
      
      if (isDiagonal) {
        // Allow diagonal movement
        if (this.cursors.left.isDown) dx = -1
        if (this.cursors.right.isDown) dx = 1
        if (this.cursors.up.isDown) dy = -1
        if (this.cursors.down.isDown) dy = 1
      } else {
        // Prioritize most recently pressed direction
        const lastKey = Object.entries(this.keyPressTimes)
          .filter(([key, pressTime]) => this.cursors[key].isDown)
          .sort((a, b) => b[1] - a[1])[0]
        
        if (lastKey) {
          switch(lastKey[0]) {
            case 'left': dx = -1; break;
            case 'right': dx = 1; break;
            case 'up': dy = -1; break;
            case 'down': dy = 1; break;
          }
        }
      }

      if (dx !== 0 || dy !== 0) {
        // Track last horizontal direction for offset
        if (dx !== 0) this.lastHorzDir = dx
        if (dy !== 0 && dx === 0) this.lastHorzDir = 0
        this.tryMove(dx, dy)
      }
    }

    // Move and update baddies only when timer expires
    this.baddieMoveTimer -= delta
    if (this.baddieMoveTimer <= 0) {
      for (const baddie of this.baddies) {
        this.updateBaddie(baddie)
      }
      this.baddieMoveTimer = MOVE_DURATION
    }

    // Handle baddie-player collision with cooldown
    if (this.baddieHurtCooldown > 0) {
      this.baddieHurtCooldown -= delta
      // Blink player during cooldown
      if (Math.floor(this.baddieHurtCooldown / 100) % 2 === 0) {
        this.player.visible = false
      } else {
        this.player.visible = true
      }
      if (this.baddieHurtCooldown <= 0) {
        this.player.visible = true // Ensure visible at end
      }
    } else {
      for (const baddie of this.baddies) {
        if (
          Math.abs(baddie.gridX - this.player.gridX) < 0.5 &&
          Math.abs(baddie.gridY - this.player.gridY) < 0.5
        ) {
          // --- Player is hurt by a baddie ---
          // Play hit sound
          this.playSound('hit')
          this.updateHealth(-10)
          this.baddieHurtCooldown = 1000 // 1 second cooldown
          break
        }
      }
    }
  }

  // --- Attempt to move the player and possibly push blocks/diamonds ---
  tryMove(dx, dy) {
    const x = this.player.gridX
    const y = this.player.gridY
    const targetX = x + dx
    const targetY = y + dy
    const target = this.getGridEntity(targetX, targetY)
    // Determine movement mode for visual alignment
    let moveMode = 'default'
    if (dx === 1) moveMode = 'right'
    else if (dx === -1) moveMode = 'default'
    else if (dy !== 0) moveMode = 'center'

    if (!target) {
      // Empty space — just move the player
      this.movePlayerTo(targetX, targetY, MOVE_DURATION, moveMode, () => {
        this.checkDiamondPickup(targetX, targetY)
      })
      return
    }
    const type = target.getData('type')
    if (type === 'diamond') {
      // Always pick up diamond, never push
      this.movePlayerTo(targetX, targetY, MOVE_DURATION, moveMode, () => {
        this.checkDiamondPickup(targetX, targetY)
      })
      return
    }
    if (type === 'block' || type === 'movingblock') {
      // Try to build a chain of pushable blocks/diamonds
      const pushChain = this.getPushChain(targetX, targetY, dx, dy)
      if (pushChain) {
        // Move player and push blocks at the same time (classic behavior)
        const pushSucceeded = this.pushBlocks(pushChain, dx, dy)
        if (pushSucceeded) {
          this.movePlayerTo(targetX, targetY, MOVE_DURATION * (pushChain.length * 2), moveMode, () => {
            this.checkDiamondPickup(targetX, targetY)
          })
        }
      }
    }
  }

  // --- Return entity in the logical grid at (x, y), or null ---
  getGridEntity(x, y) {
    return this.grid.getEntity(x, y)
  }

  // --- Collect all adjacent pushable entities (blocks or diamonds) in push direction (max 2 for now) ---
  getPushChain(x, y, dx, dy) {
    const first = this.grid.getEntity(x, y)
    if (!first || (first.getData('type') !== 'block' && first.getData('type') !== 'movingblock')) return null
    const chain = []
    let curX = x
    let curY = y
    while (true) {
      const entity = this.grid.getEntity(curX, curY)
      if (!entity) break
      const type = entity.getData('type')
      if (type !== 'block' && type !== 'diamond' && type !== 'movingblock') return null
      chain.push(entity)
      curX += dx
      curY += dy
      if (!this.grid.getEntity(curX, curY)) break
    }
    // End space must be empty to allow pushing
    const endX = curX
    const endY = curY
    if (this.grid.getEntity(endX, endY)) return null
    if (chain.length > 2) return null
    return chain
  }

  // --- Try to shove a baddie perpendicular to its axis. Returns true if successful, false if blocked. ---
  shoveBaddiePerpendicular(baddie, dx, dy) {
    // Only allow shoving perpendicular to the baddie's axis
    if ((baddie.axis === 'horizontal' && dx !== 0) || (baddie.axis === 'vertical' && dy !== 0)) {
      // Block push if trying to shove along the baddie's axis
      return false
    }
    // Determine shove direction
    const shoveX = baddie.axis === 'vertical' ? dx : 0
    const shoveY = baddie.axis === 'horizontal' ? dy : 0
    const nextX = baddie.gridX + shoveX
    const nextY = baddie.gridY + shoveY
    // Check for barriers in the next tile
    const blocked =
      this.getGridEntity(nextX, nextY) ||
      (this.baddies && this.baddies.some(b => b.gridX === nextX && b.gridY === nextY))
    if (blocked) return false
    // Check for memory hole
    if (this.isMemoryHole(nextX, nextY)) {
      this.flashAt(nextX, nextY)
      this.playSound('explode')
      baddie.destroy()
      this.baddies = this.baddies.filter(b => b !== baddie)
      return true
    }
    // Move baddie visually and logically (axis and moveDir unchanged)
    baddie.gridX = nextX
    baddie.gridY = nextY
    this.tweens.add({
      targets: baddie,
      x: baddie.gridX * TILE_SIZE + TILE_SIZE / 2,
      y: baddie.gridY * TILE_SIZE + TILE_SIZE / 2,
      duration: MOVE_DURATION,
      onComplete: () => {}
    })
    // Reflect sprite based on current axis and direction
    if (baddie.axis === 'horizontal') {
      baddie.setFlipX(baddie.moveDir === -1)
      baddie.setFlipY(false)
    } else {
      if (baddie.moveDir === 1) {
        baddie.setFlipY(false)
        baddie.setFlipX(false)
      } else {
        baddie.setFlipY(true)
        baddie.setFlipX(true)
      }
    }
    return true
  }

  // --- Push a chain of blocks/diamonds forward by 1 tile each ---
  pushBlocks(chain, dx, dy) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const block = chain[i]
      if (!block.active || (block.getData('type') === 'movingblock' && (!this.movingBlocks.includes(block) || block.moving))) continue;
      const oldX = block.gridX
      const oldY = block.gridY
      const newX = oldX + dx
      const newY = oldY + dy
      const baddieInWay = this.baddies && this.baddies.find(b => b.gridX === newX && b.gridY === newY)
      if (baddieInWay) {
        const shoved = this.shoveBaddiePerpendicular(baddieInWay, dx, dy)
        if (!shoved) {
          return false
        }
      }
      if (this.isMemoryHole(newX, newY)) {
        this.flashAt(newX, newY)
        this.playSound('explode')
        this.grid.clearPosition(oldX, oldY)
        if (block.getData('type') === 'diamond') {
          block.destroy()
          this.diamonds = this.diamonds.filter(d => d !== block)
        } else if (block.getData('type') === 'movingblock') {
          if (block.arrow) block.arrow.destroy()
          block.destroy()
          this.movingBlocks = this.movingBlocks.filter(b => b !== block)
        } else {
          block.destroy()
        }
        continue
      }
      const destEntity = this.getGridEntity(newX, newY)
      if (destEntity && destEntity !== block) continue;
      if (block.getData('type') === 'movingblock') {
        block.moving = true;
        this.grid.clearPosition(oldX, oldY);
        this.grid.setEntity(newX, newY, block);
        this.tweens.add({
          targets: [block, block.arrow],
          x: newX * TILE_SIZE + TILE_SIZE / 2,
          y: newY * TILE_SIZE + TILE_SIZE / 2,
          duration: MOVE_DURATION * (chain.length * 2),
          onComplete: () => {
            block.gridX = newX;
            block.gridY = newY;
            block.moving = false;
            // Restart movement cycle after being pushed
            this.startMovingBlock(block);
          }
        })
      } else {
        this.grid.clearPosition(oldX, oldY)
        this.grid.setEntity(newX, newY, block)
        block.gridX = newX
        block.gridY = newY
        this.tweenTo(block, newX, newY, MOVE_DURATION * (chain.length * 2))
      }
      if (chain.length > 1) {
        this.playSound('drag_long')
      } else {
        this.playSound('drag')
      }
    }
    return true
  }

  // --- Tween the player to a new tile ---
  movePlayerTo(x, y, duration = MOVE_DURATION, moveMode = 'default', onComplete = null) {
    this.player.gridX = x
    this.player.gridY = y
    this.moving = true
    this.player.setOrigin(0.5, 0) // Always use centered origin

    // Calculate movement direction for visual effects
    const dx = x - this.player.gridX
    const dy = y - this.player.gridY
    
    // Determine movement mode and offset based on direction
    let offset = 0
    if (dx === 1) {
      moveMode = 'right'
      offset = 6
    } else if (dx === -1) {
      moveMode = 'default'
      offset = -6
    } else if (dy !== 0) {
      moveMode = 'center'
      offset = 0
    }

    // For diagonal movement, use a slightly longer duration
    const adjustedDuration = (dx !== 0 && dy !== 0) ? duration * 1.2 : duration

    this.tweens.add({
      targets: this.player,
      x: x * TILE_SIZE + TILE_SIZE / 2 + offset,
      y: y * TILE_SIZE,
      duration: adjustedDuration,
      onComplete: () => {
        this.moving = false
        if (onComplete) onComplete()
      }
    })
  }

  // --- Tween a sprite (block or player) to a grid position ---
  tweenTo(sprite, gx, gy, duration = MOVE_DURATION) {
    // If this is a moving block, also move its arrow
    if (sprite.getData && sprite.getData('type') === 'movingblock' && sprite.arrow) {
      this.tweens.add({
        targets: [sprite, sprite.arrow],
        x: gx * TILE_SIZE + TILE_SIZE / 2,
        y: gy * TILE_SIZE + TILE_SIZE / 2,
        duration
      })
    } else {
      this.tweens.add({
        targets: sprite,
        x: gx * TILE_SIZE,
        y: gy * TILE_SIZE,
        duration
      })
    }
  }

  // --- Add a method to update score ---
  addScore(points) {
    this.score += points
    this.events.emit('updateScore', this.score)
  }

  // --- Add a method to update health ---
  updateHealth(amount) {
    this.health = Phaser.Math.Clamp(this.health + amount, 0, 100)
    this.events.emit('updateHealth', this.health)
    if (this.health <= 0) {
      this.playerDeath()
    }
  }

  // --- Handle player death: flash, show message, pause, restart scene ---
  playerDeath() {
    this.levelComplete = true
    // Flash at player position
    this.flashAt(this.player.gridX, this.player.gridY)
    // Delete the player
    this.player.destroy()
    this.playSound('player_death')

    // Show a message (could be replaced with a real UI)
    this.add.text(100, 200, 'Game Over', {
      fontSize: '32px',
      color: '#fff',
      backgroundColor: '#000',
      padding: { x: 10, y: 10 },
      align: 'center'
    })
    // Reset score
    this.score = 0
    // Restart the scene after a short delay
    this.time.delayedCall(2500, () => this.scene.restart())
  }

  // --- Called when all diamonds are collected ---
  async onAllDiamondsCollected() {
    this.levelComplete = true
    this.playSound('level_complete')
    this.add.text(100, 200, 'Level Complete!', {
      fontSize: '32px',
      color: '#fff',
      backgroundColor: '#000',
      padding: { x: 10, y: 10 },
      align: 'center'
    })
    // Try to load the next level after a delay
    this.time.delayedCall(2500, async () => {
      const nextLevel = this.currentLevel + 1
      const nextLevelPath = `levels/${String(nextLevel).padStart(3, '0')}.txt`
      try {
        // Only check if the file exists
        await fetch(nextLevelPath, { method: 'HEAD' })
        this.currentLevel = nextLevel
        this.scene.restart()
      } catch (e) {
        this.add.text(60, 300, 'Game Complete!', {
          fontSize: '32px',
          color: '#fff',
          backgroundColor: '#000',
          padding: { x: 10, y: 10 },
          align: 'center'
        })
        this.currentLevel = 1
        this.time.delayedCall(2500, () => this.scene.restart())
      }
    })
  }

  // --- Helper to safely play a sound by key ---
  playSound(key) {
    try {
      this.sound.play(key)
    } catch (e) {
      console.error(`Error playing sound '${key}':`, e)
    }
  }

  // --- Check if player is on a diamond or memory hole ---
  checkDiamondPickup(x, y) {
    const entity = this.grid.getEntity(x, y)
    if (entity && entity.getData('type') === 'diamond') {
      // Play diamond collect sound
      this.playSound('diamond-ping')
      // Remove diamond from grid and scene
      this.grid.clearPosition(x, y)
      entity.destroy()
      this.diamonds = this.diamonds.filter(d => !(d.gridX === x && d.gridY === y))
      this.addScore(10)
      // Check if all diamonds are collected
      if (this.diamonds.length === 0) {
        this.onAllDiamondsCollected()
      }
    }
    // Check for memory hole
    if (this.isMemoryHole(x, y)) {
      this.playerDeath()
    }
  }

  // --- Add a baddie (enemy) at (x, y), moving in 'horizontal' or 'vertical' direction ---
  addBaddie(x, y, direction = 'horizontal') {
    const baddie = this.physics.add
      .image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'baddie')
      .setDisplaySize(TILE_SIZE * 0.8, TILE_SIZE * 0.8)
      .setOrigin(0.5, 0.5)
    baddie.gridX = x
    baddie.gridY = y
    baddie.moveDir = 1 // always start moving right or down
    baddie.axis = direction // 'horizontal' or 'vertical'
    baddie.setData('type', 'baddie')
    // Set initial rotation (default: right)
    baddie.setAngle(direction === 'horizontal' ? 0 : 90)
    this.baddies.push(baddie)
    return baddie
  }

  // --- Move a baddie, reverse on hitting wall/block, reflect to face direction ---
  updateBaddie(baddie) {
    let dx = 0, dy = 0
    if (baddie.axis === 'horizontal') dx = baddie.moveDir
    else dy = baddie.moveDir
    const nextX = baddie.gridX + dx
    const nextY = baddie.gridY + dy
    // Check for memory hole
    if (this.isMemoryHole(nextX, nextY)) {
      // Baddie falls in memory hole
      this.flashAt(nextX, nextY)
      this.playSound('explode')
      baddie.destroy()
      this.baddies = this.baddies.filter(b => b !== baddie)
      return
    }
    const nextEntity = this.getGridEntity(nextX, nextY)
    if (!nextEntity || (nextEntity.getData && nextEntity.getData('type') === 'diamond')) {
      // Move to next tile
      baddie.gridX = nextX
      baddie.gridY = nextY
      this.tweens.add({
        targets: baddie,
        x: baddie.gridX * TILE_SIZE + TILE_SIZE / 2,
        y: baddie.gridY * TILE_SIZE + TILE_SIZE / 2,
        duration: MOVE_DURATION,
        onComplete: () => {}
      })
      // Reflect sprite based on direction
      if (baddie.axis === 'horizontal') {
        baddie.setFlipX(baddie.moveDir === -1)
        baddie.setFlipY(false)
      } else {
        if (baddie.moveDir === 1) {
          baddie.setFlipY(false)
          baddie.setFlipX(false)
        } else {
          baddie.setFlipY(true)
          baddie.setFlipX(true)
        }
      }
    } else {
      // Hit wall/block/player/other baddie, reverse direction
      baddie.moveDir *= -1
      // Reflect sprite based on new direction
      if (baddie.axis === 'horizontal') {
        baddie.setFlipX(baddie.moveDir === -1)
        baddie.setFlipY(false)
      } else {
        if (baddie.moveDir === 1) {
          baddie.setFlipY(false)
          baddie.setFlipX(false)
        } else {
          baddie.setFlipY(true)
          baddie.setFlipX(true)
        }
      }
    }
  }

  // --- Add a memory hole at (x, y) ---
  addMemoryHole(x, y) {
    const hole = this.add
      .image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'memoryhole')
      .setDisplaySize(TILE_SIZE * 0.8, TILE_SIZE * 0.8)
      .setOrigin(0.5, 0.5)
    hole.gridX = x
    hole.gridY = y
    hole.setData('type', 'memoryhole')
    // Do NOT store in grid array
    this.memoryHoles.push(hole)
    return hole
  }

  // --- Helper: check if a tile is a memory hole ---
  isMemoryHole(x, y) {
    return this.memoryHoles && this.memoryHoles.some(h => h.gridX === x && h.gridY === y)
  }

  // --- Flash effect at (x, y) ---
  flashAt(x, y) {
    const flash = this.add.rectangle(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE * 0.8,
      TILE_SIZE * 0.8,
      0xffffff,
      1
    )
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy()
    })
  }

  // --- Load and build a level from an ASCII file ---
  async loadLevelFromFile(path) {
    try {
      // Check if we have a level from the editor
      if (this.levelData) {
        const lines = this.levelData.split('\n').filter(line => line.length > 0)
        this.buildLevelFromLines(lines)
        return
      }

      // First try to load level 0 if it exists
      if (this.currentLevel === 1) {
        try {
          const level0Response = await fetch('levels/000.txt')
          if (level0Response.ok) {
            const text = await level0Response.text()
            const lines = text.split('\n').filter(line => line.length > 0)
            this.buildLevelFromLines(lines)
            return
          }
        } catch (e) {
          // If level 0 doesn't exist, continue to load level 1
          console.log('Level 0 not found, loading level 1')
        }
      }

      const response = await fetch(path)
      if (!response.ok) {
        // If level file doesn't exist, show Game Complete and restart
        this.add.text(60, 300, 'Game Complete!', {
          fontSize: '32px',
          color: '#fff',
          backgroundColor: '#000',
          padding: { x: 10, y: 10 },
          align: 'center'
        })
        this.currentLevel = 1
        this.time.delayedCall(2500, () => this.scene.restart())
        return
      }
      const text = await response.text()
      const lines = text.split('\n').filter(line => line.length > 0)
      this.buildLevelFromLines(lines)
    } catch (error) {
      console.error('Error loading level:', error)
      // If there's an error loading the level, show Game Complete and restart
      this.add.text(60, 300, 'Game Complete!', {
        fontSize: '32px',
        color: '#fff',
        backgroundColor: '#000',
        padding: { x: 10, y: 10 },
        align: 'center'
      })
      this.currentLevel = 1
      this.time.delayedCall(2500, () => this.scene.restart())
    }
  }

  buildLevelFromLines(lines) {
    // Clear existing entities
    this.baddies = []
    this.diamonds = []
    this.memoryHoles = []
    this.movingBlocks = []
    this.grid = new Grid()

    // Build level from ASCII
    for (let y = 0; y < lines.length; y++) {
      const line = lines[y]
      for (let x = 0; x < line.length; x++) {
        const char = line[x]
        switch (char) {
          case '#':
            this.addWall(x, y)
            break
          case 'B':
            this.addBlock(x, y)
            break
          case 'D':
            this.addDiamond(x, y)
            break
          case '@':
            this.player = this.addPlayer(x, y)
            break
          case 'H':
            this.addBaddie(x, y, 'horizontal')
            break
          case 'V':
            this.addBaddie(x, y, 'vertical')
            break
          case 'M':
            this.addMemoryHole(x, y)
            break
          case 'E':
            this.addMovingBlock(x, y, 'right')
            break
          case 'W':
            this.addMovingBlock(x, y, 'left')
            break
          case 'N':
            this.addMovingBlock(x, y, 'up')
            break
          case 'S':
            this.addMovingBlock(x, y, 'down')
            break
        }
      }
    }
  }

  // --- Add a moving block at (x, y) with specified direction ---
  addMovingBlock(x, y, direction) {
    const block = this.physics.add
      .image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'block')
      .setDisplaySize(TILE_SIZE * 0.8, TILE_SIZE * 0.8)
      .setOrigin(0.5)
    
    // Add arrow overlay
    const arrow = this.add.image(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE / 2,
      `arrow-${direction}`
    )
    .setDisplaySize(TILE_SIZE * 0.4, TILE_SIZE * 0.4)
    .setOrigin(0.5)
    
    // Set arrow rotation based on direction
    switch(direction) {
      case 'up': arrow.setAngle(-90); break;
      case 'down': arrow.setAngle(90); break;
      case 'left': arrow.setAngle(180); break;
      case 'right': arrow.setAngle(0); break;
    }
    
    block.body.setImmovable(true)
    block.setData('type', 'movingblock')
    block.setData('direction', direction)
    block.gridX = x
    block.gridY = y
    block.arrow = arrow // Store reference to arrow sprite
    this.grid.setEntity(x, y, block)
    this.movingBlocks.push(block)
    return block
  }

  // --- Start a moving block's movement cycle ---
  startMovingBlock(block) {
    if (!block.active) return;
    const tryMoveBlock = () => {
      if (!block.active || block.moving || this.levelComplete) return;
      const direction = block.getData('direction')
      let dx = 0, dy = 0
      switch(direction) {
        case 'up': dy = -1; break;
        case 'down': dy = 1; break;
        case 'left': dx = -1; break;
        case 'right': dx = 1; break;
      }
      const nextX = block.gridX + dx
      const nextY = block.gridY + dy
      // Check for memory hole
      if (this.isMemoryHole(nextX, nextY)) {
        this.flashAt(nextX, nextY)
        this.playSound('explode')
        this.grid.clearPosition(block.gridX, block.gridY)
        if (block.arrow) block.arrow.destroy()
        block.destroy()
        this.movingBlocks = this.movingBlocks.filter(b => b !== block)
        return;
      }
      // Check if next position is occupied by player
      if (this.player && this.player.gridX === nextX && this.player.gridY === nextY) {
        setTimeout(tryMoveBlock, MOVE_DURATION)
        return;
      }
      const nextEntity = this.grid.getEntity(nextX, nextY)
      if (nextEntity && nextEntity !== block) {
        setTimeout(tryMoveBlock, MOVE_DURATION)
        return;
      }
      // Only move if destination is empty
      if (nextEntity) {
        setTimeout(tryMoveBlock, MOVE_DURATION)
        return;
      }
      block.moving = true;
      // Update grid immediately
      this.grid.clearPosition(block.gridX, block.gridY);
      this.grid.setEntity(nextX, nextY, block);
      this.tweens.add({
        targets: [block, block.arrow],
        x: nextX * TILE_SIZE + TILE_SIZE / 2,
        y: nextY * TILE_SIZE + TILE_SIZE / 2,
        duration: MOVE_DURATION,
        onComplete: () => {
          block.gridX = nextX;
          block.gridY = nextY;
          block.moving = false;
          // Immediately try to move again
          tryMoveBlock();
        }
      })
    };
    tryMoveBlock();
  }
}