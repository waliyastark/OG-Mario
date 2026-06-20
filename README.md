# OG Mario

OG Mario is a self-contained browser platformer recreating the feel and flow of the original first-stage side-scrolling adventure: a world intro, scrolling overworld, pipes, brick and question blocks, enemies, coins, mushrooms, a hidden 1-up, an underground bonus room, a flagpole finish, and score countdown.

## Play

Open `index.html` in any modern desktop browser.

No build step, install step, server, or internet connection is required. The whole game runs from the local files in this folder.

Sound effects start after your first keyboard or touch input, which matches normal browser audio rules.

## Controls

| Action | Keyboard |
| --- | --- |
| Move left/right | Arrow keys or A/D |
| Run / throw fireballs after flower | Shift or X |
| Jump | Space, Z, or Up |
| Enter usable pipes | Down or S |
| Restart after game over | Enter |

Touch controls appear automatically on mobile devices.

## Goal

Reach the flagpole at the far right of the level. Collect coins, stomp enemies, hit blocks from below, find the hidden 1-up, power up from mushroom to flower, and enter the correct pipe to visit the underground bonus room before returning to the main course.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Launches the game |
| `styles.css` | Page layout, scaling, and mobile controls |
| `game.js` | Canvas rendering, physics, level data, enemies, items, scoring, and game state |

## Notes

This is an original browser recreation built with custom canvas drawing and JavaScript. It does not include Nintendo ROM data, music, sound effects, or ripped sprite assets.
