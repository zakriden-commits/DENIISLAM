"""Generate the project's original launch icons; requires Pillow."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root=Path(__file__).resolve().parent.parent
font='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def icon(size,foreground=False):
    im=Image.new('RGBA',(512,512),(0,0,0,0) if foreground else '#1b2b22')
    d=ImageDraw.Draw(im)
    if foreground: d.rounded_rectangle((45,45,467,467),radius=80,fill='#1b2b22')
    d.text((68,135),'DI',font=ImageFont.truetype(font,215),fill='#eeeadd',stroke_width=0)
    d.rectangle((388,295,432,341),fill='#d5ef6a')
    d.rectangle((80,406,432,410),fill='#d5ef6a')
    return im.resize((size,size),Image.Resampling.LANCZOS)
for size in [192,512]:icon(size).save(root/f'public/icons/icon-{size}.png')
res=root/'android/app/src/main/res'
for den,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    for name in ['ic_launcher','ic_launcher_round']:
        icon(size).save(res/f'mipmap-{den}/{name}.png')
    icon(round(size*2.25),True).save(res/f'mipmap-{den}/ic_launcher_foreground.png')
# Replace generated Capacitor splash screens with an actual game mark.
for file in res.glob('drawable*/splash.png'):
    old=Image.open(file);w,h=old.size
    im=Image.new('RGB',(w,h),'#1b2b22');mark=icon(max(32,min(w,h)//3));im.paste(mark,((w-mark.width)//2,(h-mark.height)//2),mark);im.save(file)
