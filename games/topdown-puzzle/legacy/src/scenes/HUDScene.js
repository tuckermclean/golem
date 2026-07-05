import Phaser from 'phaser'

// HUDScene displays the player's score and health at the top of the game
export default class HUDScene extends Phaser.Scene {
  constructor() {
    super('HUDScene')
  }

  create() {
    // Create a semi-transparent background for the HUD bar
    const hudBg = this.add.rectangle(0, 0, 430, 40, 0x000000, 0.7)
    hudBg.setOrigin(0, 0)

    // Create score text (left side)
    this.scoreText = this.add.text(16, 8, 'Score: -', {
      fontSize: '20px',
      fontFamily: 'Arial',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    })

    // Create health text (right side)
    this.healthText = this.add.text(270, 8, 'Health: -', {
      fontSize: '20px',
      fontFamily: 'Arial',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    })

    // Listen for events from the main game scene to update HUD
    // When the score or health changes, update the display
    this.scene.get('KyeScene').events.on('updateScore', this.updateScore, this)
    this.scene.get('KyeScene').events.on('updateHealth', this.updateHealth, this)
    // Request initial values from KyeScene
    this.scene.get('KyeScene').events.emit('requestHUDSync')
  }

  // Update the score display
  updateScore(score) {
    this.scoreText.setText(`Score: ${score}`)
  }

  // Update the health display
  updateHealth(health) {
    this.healthText.setText(`Health: ${health}`)
  }
} 