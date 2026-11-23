# Art & sound slots (Adobe Firefly)

The app already works with built-in vector art. Every slot below is **optional**. Drop a file with the exact name into `public/assets/`, redeploy, and the app swaps it in automatically. If a file is missing, the built-in art stays.

**Style to keep everything consistent:** *bright 3D toy-brick diorama, glossy plastic interlocking bricks with round studs, soft studio lighting, tilt-shift miniature look, cheerful saturated red / yellow / blue / green, clean background, kid-friendly, no text, no logos.*

Tips:
- In prompts, say "toy building bricks" or "interlocking plastic bricks". Don't use brand names; Firefly avoids them, and the result stays original.
- Save as **WebP** (or PNG if you need transparency) and keep each file under about 400 KB so the app stays fast on a tablet.
- Use Firefly's **Style reference**: upload your first good image as a style reference for all the others, so the set looks like one family.

---

## 1. Stadium stages: the main reward (most important)

Files: `stadium-0.webp` … `stadium-6.webp`. Size **2000 × 1040 px** (aspect ratio about 1.92 : 1, landscape). Use the same camera angle in all seven.

**Best method:** generate **stage 6 (finished stadium) first**. Then build the earlier stages from that image with **Generative Fill**, removing parts one at a time, so every stage lines up exactly.

Base prompt (stage 6):
> Wide 3D diorama of a cricket stadium built entirely from colourful toy building bricks, oval green grass field with mowed stripes, light-brown pitch in the centre with white stumps, red-brick pavilion with a golden trophy on the roof on the left, curved grandstands full of tiny brick spectators at the back, four tall floodlight towers glowing, big dark scoreboard on the right, bunting flags and small fireworks, golden-hour sky, tilt-shift miniature photography, glossy plastic, cheerful, no text

| File | Unlocks at | Remove from stage 6 (Generative Fill → "grass" / "sky") |
| --- | --- | --- |
| `stadium-0.webp` | 0 runs | everything: just the empty brick grass oval under a blue sky |
| `stadium-1.webp` | 120 | keep only the pitch + stumps |
| `stadium-2.webp` | 350 | + red-brick pavilion (no trophy) |
| `stadium-3.webp` | 700 | + grandstands with spectators |
| `stadium-4.webp` | 1200 | + floodlights (switch the sky to dusk) |
| `stadium-5.webp` | 1900 | + scoreboard (leave its screen blank; the app shows runs on the built-in version only) |
| `stadium-6.webp` | 2800 | the full image: trophy, bunting, fireworks |

## 2. Coach Stumpy (mascot)

File: `coach.webp`. Size **600 × 660 px**, **transparent background**.
> Cute friendly robot cricket coach made from toy building bricks: square red brick head with two round studs on top, big round cartoon eyes, a blue cricket cap, yellow brick body, blue brick legs, holding a small wooden cricket bat, a red cricket ball at its feet, waving, full body, 3D render, glossy plastic, isolated on transparent background, no text

Optional extra poses for later (not wired in yet): cheering with both arms up; thinking with a hand on its chin.

## 3. Login hero

File: `login-hero.webp`. Size **1600 × 1800 px** (portrait-ish; it fills the left half on desktop and a strip on phones).
> Close-up 3D toy-brick diorama: a small brick cricket batsman hitting a ball high into a sunset sky over a brick cricket stadium, motion trail behind the ball, confetti bricks flying, dramatic low camera angle, tilt-shift, glossy plastic, joyful, no text

## 4. Badges (14)

Files in `badges/`: `badges/<code>.webp`. Size **256 × 236 px**, **transparent background**.
Shared prompt start: *"Round game achievement medal made of glossy toy building bricks, centred, isolated on transparent background, 3D icon, no text, featuring …"*

| File | Badge | … featuring |
| --- | --- | --- |
| `first_innings.webp` | First Innings | a single cricket bat and ball, red |
| `fifty.webp` | Half-Century | a bat raised in celebration, orange glow |
| `perfect_over.webp` | Perfect Over | six cricket balls in a ring, teal |
| `clean_sheet.webp` | Clean Sheet | three upright stumps with bails intact, navy shield |
| `streak3.webp` | Partnership 3 | two bats crossed, small yellow flame |
| `streak7.webp` | Partnership 7 | two bats crossed, big orange flame |
| `streak14.webp` | Iron Partnership | two bats crossed inside an iron-grey shield, red flame |
| `big_gain.webp` | Big Improver | a staircase of bricks with an arrow going up, purple |
| `topic_master.webp` | Topic Master | a golden crown on a stack of books, navy |
| `comeback.webp` | Comeback King | a cricket ball with a circular arrow, mint green |
| `all_rounder.webp` | All-Rounder | a bat, ball and gloves around a star, blue |
| `full_match.webp` | Full Match | seven toy bricks stacked like a small wall inside the medal, a bottom row of 4 and a top row of 3 (offset like real brickwork), each brick with a green tick, a cricket ball on top, red |
| `early_bird.webp` | Early Bird | a rising sun behind a cricket pitch, golden |
| `honest_review.webp` | Honest Review | a brick umpire making the "T" review signal with both hands, a small green tick on a ball-tracking screen behind (successful DRS), violet |

## 5. Favicon

`favicon.png`, **64 × 64 px**: Coach Stumpy's head, or a red brick with two studs.

## 6. Sounds (optional, `sfx/` folder, MP3, each under 2 s)

Firefly doesn't make sound effects. Use any royalty-free sound library, or leave these out and the app makes its own sounds.
`sfx/hit.mp3` (bat on ball), `sfx/four.mp3` (bat + crowd cheer), `sfx/six.mp3` (bat + big roar), `sfx/out.mp3` (stumps rattle + "ooh"), `sfx/badge.mp3` (short fanfare), `sfx/click.mp3` (soft click).

---

### Checklist
```
public/assets/
  login-hero.webp
  coach.webp
  favicon.png
  stadium-0.webp … stadium-6.webp
  badges/first_innings.webp … badges/honest_review.webp   (14 files)
  sfx/hit.mp3 four.mp3 six.mp3 out.mp3 badge.mp3 click.mp3 (optional)
```
