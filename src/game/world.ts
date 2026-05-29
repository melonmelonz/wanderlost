// src/game/world.ts
// Finite authored world. No streaming, no procedural generation. World is a thin reader over
// WORLD_MAP plus the seed used for shared reveal/open RNG (kept stable across clients).
import { GroundType, WORLD_MAP, expandScene, type WorldMap, type PlacedProp } from './map-data';

export const TILE = 32;
export { GroundType } from './map-data';
export type { PlacedProp } from './map-data';

export class World {
  readonly map: WorldMap;
  private _drawables: PlacedProp[];

  constructor(public readonly seed: number, map: WorldMap = WORLD_MAP) {
    this.map = map;
    this._drawables = [...map.props, ...map.scenes.flatMap(expandScene)];
  }

  static tileKey(tx: number, ty: number) { return `${tx},${ty}`; }

  get width() { return this.map.width; }
  get height() { return this.map.height; }

  private idx(tx: number, ty: number) { return ty * this.map.width + tx; }
  inBounds(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height; }

  groundAt(tx: number, ty: number): GroundType {
    if (!this.inBounds(tx, ty)) return GroundType.Cliff;
    return this.map.ground[this.idx(tx, ty)] as GroundType;
  }

  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.map.collision[this.idx(tx, ty)] === 1;
  }

  isGrass(tx: number, ty: number): boolean { return this.groundAt(tx, ty) === GroundType.Grass; }

  // All renderable props (standalone + scene-expanded). Stable list, computed once.
  drawables(): readonly PlacedProp[] { return this._drawables; }

  get spawn() { return this.map.spawn; }
}
