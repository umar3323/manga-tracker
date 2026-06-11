import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pub = join(root, 'public')
const ext = join(root, 'extension/icons')

const starB64 = sharp(join(pub, 'logo-star.png')).toBuffer().then(b => b.toString('base64'))
const snakeB64 = sharp(join(pub, 'logo-u-snake.png')).toBuffer().then(b => b.toString('base64'))

async function createBadgeIcon(size, out) {
  const star = await starB64
  const snake = await snakeB64

  const pad = Math.round(size * 0.03)
  const badgeW = Math.round(size * 0.84)
  const badgeH = Math.round(size * 0.70)
  const badgeX = Math.round((size - badgeW) / 2)
  const badgeY = size - badgeH - pad
  const r = Math.round(Math.min(badgeW, badgeH) * 0.17)
  const bw = Math.max(1.5, size * 0.04)

  const starS = Math.round(size * 0.32)
  const starX = Math.round((size - starS) / 2)
  const starY = badgeY - starS - Math.round(size * 0.01)

  const snakePad = Math.round(badgeH * 0.09)
  const snakeS = badgeH - snakePad * 2
  const snakeX = badgeX + Math.round((badgeW - snakeS) / 2)
  const snakeY = badgeY + snakePad

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <filter id="to-red">
      <feFlood flood-color="#FF2D46" flood-opacity="1" result="flood"/>
      <feComposite in="flood" in2="SourceGraphic" operator="in"/>
    </filter>
  </defs>
  <image href="data:image/png;base64,${star}" x="${starX}" y="${starY}" width="${starS}" height="${starS}" preserveAspectRatio="xMidYMid meet"/>
  <rect x="${badgeX + bw / 2}" y="${badgeY + bw / 2}" width="${badgeW - bw}" height="${badgeH - bw}" rx="${r}" ry="${r}" fill="#0d0d0d" stroke="#FF2D46" stroke-width="${bw}"/>
  <image href="data:image/png;base64,${snake}" x="${snakeX}" y="${snakeY}" width="${snakeS}" height="${snakeS}" preserveAspectRatio="xMidYMid meet" filter="url(#to-red)"/>
</svg>`

  await sharp(Buffer.from(svg)).png().toFile(out)
  console.log('✓', out)
}

await createBadgeIcon(128, join(ext, 'icon128.png'))
await createBadgeIcon(48,  join(ext, 'icon48.png'))
await createBadgeIcon(16,  join(ext, 'icon16.png'))
await createBadgeIcon(64,  join(pub, 'logo-badge.png'))
await createBadgeIcon(32,  join(pub, 'favicon-32.png'))
console.log('Done')
