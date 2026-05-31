# assets/ — drop replacement art here

This folder is for your own sprite images (PNG / SVG / GIF). It starts empty.

## How to swap a sprite to an image

1. Drop a file in here, e.g. `assets/hero.png`.
2. Open `resources.jsx`, find the entry in the `RES` table, and switch it to an image:

   ```js
   player: { kind: 'image', src: 'assets/hero.png', w: 36, h: 36 },
   ```

   - `w` / `h` — on-board render size in px (the art is centred on its hex cell).
   - `dx` / `dy` — optional nudge in px.
   - `smooth: true` — normal scaling for photo/vector art. Omit it for pixel-art
     PNGs so they stay crisp.

That's it. The sprite keeps its drop-shadow, animation (hop / hover / spin / bob)
and red warning glow automatically — you never edit `sprites.jsx`.

## Registry keys

| key | what it is | key | what it is |
|-----|------------|-----|------------|
| `player` | hero / you | `drone` | falling bullet |
| `droneFz` | bullet while frozen | `star` | score pickup ★ |
| `bomb` | bomb pickup ✸ | `tp` | warp pickup ✦ |
| `hint` | foresight pickup ◉ | `explode` | explosion burst |
| `portal` | stage goal gate | `gem` | required star (collect) |
| `chaser` | homing enemy | `spike` | death floor ◆ |
| `turret` | column cannon ▲ | `wall` | solid block (vector by default) |

To re-pixel art instead of using an image, edit that entry's `grid` + `map` —
both live at the top of `resources.jsx`.
