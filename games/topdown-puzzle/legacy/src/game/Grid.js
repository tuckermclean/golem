// Grid dimensions
const GRID_WIDTH = 10
const GRID_HEIGHT = 21

export default class Grid {
  constructor() {
    this.width = 10;
    this.height = 21;
    this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(null));
  }

  // Get entity at position
  getEntity(x, y) {
    if (!this.isValidPosition(x, y)) return null;
    return this.grid[y][x];
  }

  // Set entity at position
  setEntity(x, y, entity) {
    if (!this.isValidPosition(x, y)) return false;
    this.grid[y][x] = entity;
    return true;
  }

  // Clear position
  clearPosition(x, y) {
    if (!this.isValidPosition(x, y)) return false;
    this.grid[y][x] = null;
    return true;
  }

  // Check if position is valid
  isValidPosition(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  // Check if position is empty
  isEmpty(x, y) {
    if (!this.isValidPosition(x, y)) return false;
    return this.grid[y][x] === null;
  }

  // Get all entities of a specific type
  getEntitiesByType(type) {
    const entities = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const entity = this.grid[y][x];
        if (entity && entity.type === type) {
          entities.push(entity);
        }
      }
    }
    return entities;
  }

  // Move entity from one position to another
  moveEntity(fromX, fromY, toX, toY) {
    if (!this.isValidPosition(fromX, fromY) || !this.isValidPosition(toX, toY)) return false
    const entity = this.getEntity(fromX, fromY)
    if (!entity) return false
    
    this.clearPosition(fromX, fromY)
    this.setEntity(toX, toY, entity)
    return true
  }

  // Get dimensions
  getWidth() {
    return this.width
  }

  getHeight() {
    return this.height
  }

  // Clear the entire grid
  clear() {
    this.grid = Array(this.height).fill(null).map(() => Array(this.width).fill(null))
  }
} 