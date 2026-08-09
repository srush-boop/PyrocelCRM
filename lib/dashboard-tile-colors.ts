import type { CSSProperties } from 'react'
import { TILE_COLOR_OPTIONS as WIDE_TILE_COLOR_OPTIONS } from './service-colors'

/**
 * Colour swatches offered when personalising a dashboard tile. Uses the wider
 * personalisation palette (full spectrum incl. purple/pink) rather than the
 * constrained service-type palette, since these are personal preferences.
 */
export const TILE_COLOR_OPTIONS = WIDE_TILE_COLOR_OPTIONS

/**
 * Inline styles for a tile's icon badge given a stored hex colour. The badge
 * uses a ~10% tint of the colour as its background and the solid colour for the
 * icon itself. Expects a 6-digit hex (all preset options are); anything else is
 * treated as "no override" so the caller can fall back to the theme classes.
 */
export function tileIconStyle(hex?: string | null): CSSProperties | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined
  return {
    backgroundColor: `${hex}1a`, // hex + 0x1a alpha ≈ 10%
    color: hex,
  }
}

/** Inline style for a thin accent bar/border using the tile colour. */
export function tileAccentStyle(hex?: string | null): CSSProperties | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined
  return { backgroundColor: hex }
}

/**
 * Inline style tinting the whole tile background with a very light (~8%)
 * transparent wash of the tile colour, so a colour-coded tile reads at a glance
 * without overpowering its content. Returns undefined for "no override".
 */
export function tileCardStyle(hex?: string | null): CSSProperties | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined
  return { backgroundColor: `${hex}14` } // hex + 0x14 alpha ≈ 8%
}
