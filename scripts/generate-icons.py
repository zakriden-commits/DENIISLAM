"""Generate the new survival compass / forest icon (Pillow, optional art tooling)."""
from PIL import Image,ImageDraw
from pathlib import Path
im=Image.new('RGBA',(512,512),'#17201e');d=ImageDraw.Draw(im)
d.rounded_rectangle((12,12,500,500),radius=98,outline='#89927a',width=3)
d.ellipse((94,74,418,398),outline='#7f8b74',width=5)
for line in [(256,45,256,83),(256,390,256,432),(62,236,101,236),(412,236,450,236)]:d.line(line,fill='#df9a5b',width=7)
for x,y,s in [(180,307,.75),(326,308,.62)]:
 for dy,w in [(0,38),(24,51),(50,65)]:d.polygon([(x,y-140*s+dy*s),(x-w*s,y-80*s+dy*s),(x+w*s,y-80*s+dy*s)],fill='#bbc5ae')
 d.rectangle((x-6*s,y-40*s,x+6*s,y),fill='#bbc5ae')
d.polygon([(256,112),(224,274),(256,245),(288,274)],fill='#df9a5b')
d.polygon([(256,360),(224,274),(256,294),(288,274)],fill='#56684f')
d.line((152,428,360,428),fill='#df9a5b',width=4)
for size in [192,512]:im.resize((size,size),Image.Resampling.LANCZOS).save(f'public/icons/icon-{size}.png')
for folder,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
 for n in ['ic_launcher','ic_launcher_round','ic_launcher_foreground']:im.resize((size,size),Image.Resampling.LANCZOS).save(f'android/app/src/main/res/mipmap-{folder}/{n}.png')
Path('public/icons/icon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#17201e"/><circle cx="256" cy="236" r="164" fill="none" stroke="#7f8b74" stroke-width="5"/><path d="M256 112l-32 162 32-29 32 29z" fill="#df9a5b"/><path d="M256 360l-32-86 32 20 32-20z" fill="#56684f"/><path d="M180 180l-50 110h100zM326 196l-45 100h90z" fill="#bbc5ae"/><path d="M256 45v38m0 307v42M62 236h39m311 0h38M152 428h208" stroke="#df9a5b" stroke-width="7"/></svg>')
