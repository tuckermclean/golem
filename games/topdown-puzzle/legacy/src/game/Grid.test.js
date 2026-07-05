import { jest } from '@jest/globals';
import Grid from './Grid.js';

describe('Grid', () => {
  let grid;

  beforeEach(() => {
    grid = new Grid();
  });

  test('initializes with correct dimensions', () => {
    expect(grid.getWidth()).toBe(10);
    expect(grid.getHeight()).toBe(21);
  });

  test('validates positions correctly', () => {
    expect(grid.isValidPosition(0, 0)).toBe(true);
    expect(grid.isValidPosition(9, 20)).toBe(true);
    expect(grid.isValidPosition(-1, 0)).toBe(false);
    expect(grid.isValidPosition(0, -1)).toBe(false);
    expect(grid.isValidPosition(10, 0)).toBe(false);
    expect(grid.isValidPosition(0, 21)).toBe(false);
  });

  test('sets and gets entities correctly', () => {
    const entity = { type: 'test' };
    grid.setEntity(5, 5, entity);
    expect(grid.getEntity(5, 5)).toBe(entity);
  });

  test('returns null when getting entity at invalid position', () => {
    expect(grid.getEntity(-1, 0)).toBeNull();
    expect(grid.getEntity(0, -1)).toBeNull();
    expect(grid.getEntity(10, 0)).toBeNull();
    expect(grid.getEntity(0, 21)).toBeNull();
  });

  test('returns false when setting entity at invalid position', () => {
    const entity = { type: 'test' };
    expect(grid.setEntity(-1, 0, entity)).toBe(false);
    expect(grid.setEntity(0, -1, entity)).toBe(false);
    expect(grid.setEntity(10, 0, entity)).toBe(false);
    expect(grid.setEntity(0, 21, entity)).toBe(false);
  });

  test('clears positions correctly', () => {
    const entity = { type: 'test' };
    grid.setEntity(5, 5, entity);
    grid.clearPosition(5, 5);
    expect(grid.isEmpty(5, 5)).toBe(true);
  });

  test('returns false when clearing invalid position', () => {
    expect(grid.clearPosition(-1, 0)).toBe(false);
    expect(grid.clearPosition(0, -1)).toBe(false);
    expect(grid.clearPosition(10, 0)).toBe(false);
    expect(grid.clearPosition(0, 21)).toBe(false);
  });

  test('moves entities correctly', () => {
    const entity = { type: 'test' };
    grid.setEntity(5, 5, entity);
    grid.moveEntity(5, 5, 6, 6);
    expect(grid.isEmpty(5, 5)).toBe(true);
    expect(grid.getEntity(6, 6)).toBe(entity);
  });

  test('returns false when moving from invalid position', () => {
    const entity = { type: 'test' };
    expect(grid.moveEntity(-1, 0, 5, 5)).toBe(false);
    expect(grid.moveEntity(0, -1, 5, 5)).toBe(false);
    expect(grid.moveEntity(10, 0, 5, 5)).toBe(false);
    expect(grid.moveEntity(0, 21, 5, 5)).toBe(false);
  });

  test('returns false when moving to invalid position', () => {
    const entity = { type: 'test' };
    grid.setEntity(5, 5, entity);
    expect(grid.moveEntity(5, 5, -1, 0)).toBe(false);
    expect(grid.moveEntity(5, 5, 0, -1)).toBe(false);
    expect(grid.moveEntity(5, 5, 10, 0)).toBe(false);
    expect(grid.moveEntity(5, 5, 0, 21)).toBe(false);
  });

  test('returns false when moving from empty position', () => {
    expect(grid.moveEntity(5, 5, 6, 6)).toBe(false);
  });

  test('gets entities by type correctly', () => {
    const entity1 = { type: 'test1' };
    const entity2 = { type: 'test2' };
    const entity3 = { type: 'test1' };
    
    grid.setEntity(1, 1, entity1);
    grid.setEntity(2, 2, entity2);
    grid.setEntity(3, 3, entity3);

    const test1Entities = grid.getEntitiesByType('test1');
    expect(test1Entities).toHaveLength(2);
    expect(test1Entities).toContain(entity1);
    expect(test1Entities).toContain(entity3);
  });

  test('returns empty array when no entities of type exist', () => {
    const entity1 = { type: 'test1' };
    grid.setEntity(1, 1, entity1);
    const nonExistentEntities = grid.getEntitiesByType('nonexistent');
    expect(nonExistentEntities).toHaveLength(0);
  });

  test('clears the entire grid correctly', () => {
    const entity1 = { type: 'test1' };
    const entity2 = { type: 'test2' };
    
    grid.setEntity(1, 1, entity1);
    grid.setEntity(2, 2, entity2);
    
    grid.clear();
    
    expect(grid.isEmpty(1, 1)).toBe(true);
    expect(grid.isEmpty(2, 2)).toBe(true);
  });

  test('returns false for isEmpty on invalid positions', () => {
    expect(grid.isEmpty(-1, 0)).toBe(false);
    expect(grid.isEmpty(0, -1)).toBe(false);
    expect(grid.isEmpty(10, 0)).toBe(false);
    expect(grid.isEmpty(0, 21)).toBe(false);
  });
}); 