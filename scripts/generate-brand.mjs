import sharp from 'sharp'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
// The tile is --espresso, the same colour as the sidebar, the status bar and the
// edge-to-edge scrim — so the launcher icon and the chrome it opens into agree.
// The P is --surface rather than pure white, which would be the one cold value
// in a warm palette. The tick is --bronze-400, the step tokens.css marks
// decorative because it cannot hold text; an accent tick is exactly that, and it
// reads 5.12:1 on the tile against the P's 14.67:1.
const espresso = '#2a2218'
const mark = `<path d="M344 750V294h188c126 0 198 65 198 164s-72 164-198 164h-90" fill="none" stroke="#fbf7f0" stroke-width="88" stroke-linecap="round" stroke-linejoin="round"/><path d="m470 458 72 72 152-164" fill="none" stroke="#c78457" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>`
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>\n`
const icon = svg(`<rect width="1024" height="1024" rx="224" fill="${espresso}"/>${mark}`)
const full = svg(`<rect width="1024" height="1024" fill="${espresso}"/>${mark}`)
const foreground = svg(`<g transform="translate(512 512) scale(.65) translate(-512 -512)">${mark}</g>`)
await mkdir('public/brand', { recursive:true })
await mkdir('assets/brand', { recursive:true })
for (const [name,data] of Object.entries({'icon.svg':icon,'icon-foreground.svg':foreground,'icon-background.svg':svg(`<rect width="1024" height="1024" fill="${espresso}"/>`)})) await writeFile(`assets/${name}`,data)
await writeFile('public/brand/logo.svg',icon)
await writeFile('public/brand/mark.svg',svg(mark))
await writeFile('public/favicon.svg',icon)
for (const size of [16,32,48,180,192,512,1024]) await sharp(Buffer.from(icon)).resize(size,size).png().toFile(`public/brand/icon-${size}.png`)
await copyFile('public/brand/icon-180.png','public/apple-touch-icon.png')
const images = await Promise.all([16,32,48].map(s=>sharp(Buffer.from(icon)).resize(s,s).png().toBuffer()))
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4)
let offset=header.length
images.forEach((b,i)=>{const p=6+16*i;header[p]=[16,32,48][i];header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(b.length,p+8);header.writeUInt32LE(offset,p+12);offset+=b.length})
await writeFile('public/favicon.ico',Buffer.concat([header,...images]))
for(const [density,size] of Object.entries({ldpi:36,mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
 const dir=`android/app/src/main/res/mipmap-${density}`;await mkdir(dir,{recursive:true})
 await sharp(Buffer.from(full)).resize(size,size).png().toFile(`${dir}/ic_launcher.png`)
 await sharp(Buffer.from(full)).resize(size,size).composite([{input:Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`),blend:'dest-in'}]).png().toFile(`${dir}/ic_launcher_round.png`)
 for(const layer of ['foreground','background'])await sharp(`assets/icon-${layer}.svg`).resize(Math.round(size*2.25),Math.round(size*2.25)).png().toFile(`${dir}/ic_launcher_${layer}.png`)
}
await writeFile('public/site.webmanifest', JSON.stringify({name:'Présence',short_name:'Présence',icons:[{src:'/brand/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/brand/icon-512.png',sizes:'512x512',type:'image/png'}],theme_color:espresso,background_color:espresso,display:'standalone'},null,2)+'\n')
console.log('Created SVG logo, web icons, ICO favicon, and Android launcher assets.')
