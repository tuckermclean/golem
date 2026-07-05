// Skin registry. The active skin rides on the game object (game.skin), so
// it's cheat-menu-togglable and trivially controllable in tests. Skins are
// pure data + ctx-taking functions — headlessly importable.

import { desert } from './desert.js';
import { pflum } from './pflum.js';

export const SKINS = { desert, pflum };
export const DEFAULT_SKIN = 'pflum';

export function getSkin(game) {
  return SKINS[game && game.skin] || SKINS[DEFAULT_SKIN];
}
