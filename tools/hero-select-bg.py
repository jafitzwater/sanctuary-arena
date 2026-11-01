# Hero select backdrop (t373u): Joseph-supplied D2R "Select Hero Class" art (refs/hero-select-bg.jpg).
# Removes the baked-in title/blurb text and the baked Sorceress lightning (drawn live on a canvas instead),
# then writes a 1920px WebP. Needs opencv-python-headless + numpy. Usage: python tools/hero-select-bg.py <src.jpg>
# t378u: `python tools/hero-select-bg.py --measure` prints each hero's mean luminance in the shipped WebP
# (HeroSpot.lum in src/game/heroSelect.ts; boxes below mirror HERO_SPOTS x/top/feet/w).
import cv2, numpy as np
import sys
if len(sys.argv)>1 and sys.argv[1]=='--measure':
    im=cv2.imread('public/ui/hero-select-bg.webp')[...,::-1].astype(float); k=im.shape[1]/1024
    spots=dict(amazon=(334,160,288,54),assassin=(392,166,282,46),necromancer=(450,158,276,50),barbarian=(508,146,270,56),
               paladin=(573,154,272,54),sorceress=(632,140,286,56),druid=(700,156,282,54))
    for name,(x,t,f,w) in spots.items():
        print(name, round(im[int(t*k):int(f*k),int((x-w/2)*k):int((x+w/2)*k)].mean(),1))
    sys.exit(0)
src=cv2.imread(sys.argv[1] if len(sys.argv)>1 else "hero-select-bg.jpg")
H,W=src.shape[:2]; s=W/1024
def R(x0,y0,x1,y1): return int(x0*s),int(y0*s),int(x1*s),int(y1*s)
out=src.copy()
# 1) baked lightning: inpaint the bright bolt core, then neutralise the blue glow
mask=np.zeros((H,W),np.uint8)
x0,y0,x1,y1=R(592,112,672,165)
reg=src[y0:y1,x0:x1].astype(int)
b,g,r=reg[...,0],reg[...,1],reg[...,2]
warm=(r>b-4)
core=(((b>150)&((b-r)>20))|((b>215)&(g>200))).astype(np.uint8)*255
core=cv2.dilate(core,np.ones((7,7),np.uint8))
core[cv2.dilate(warm.astype(np.uint8),np.ones((5,5),np.uint8))>0]=0
mask[y0:y1,x0:x1]|=core
out=cv2.inpaint(out,mask,6,cv2.INPAINT_NS)
reg=out[y0:y1,x0:x1].astype(float)
b,g,r=reg[...,0],reg[...,1],reg[...,2]
excess=np.clip(b-(r+g)/2-4,0,None)
k=np.clip(excess/40,0,1)
lum=(0.3*r+0.5*g+0.2*b)
tgt=lum*0.82
for i,c in enumerate((b,g,r)):
    reg[...,i]=c*(1-k)+(tgt*[0.98,1.0,1.02][i])*k
out[y0:y1,x0:x1]=np.clip(reg,0,255).astype(np.uint8)

# 2) baked text: whole line boxes (our own title/blurb sits there)
tmask=np.zeros((H,W),np.uint8)
for box in [(440,20,586,40),(466,52,560,74),(416,73,608,101)]:
    a,b_,c,d=R(*box); tmask[b_:d,a:c]=255
out=cv2.inpaint(out,tmask,25,cv2.INPAINT_TELEA)
# soften the inpainted patches so they read as haze
blur=cv2.GaussianBlur(out,(0,0),18)
soft=cv2.GaussianBlur(cv2.dilate(tmask,np.ones((31,31),np.uint8)),(0,0),14).astype(float)/255
soft=soft[...,None]
out=(out*(1-soft)+blur*soft).astype(np.uint8)
small=cv2.resize(out,(1920,int(round(H*1920/W))),interpolation=cv2.INTER_AREA)
cv2.imwrite('public/ui/hero-select-bg.webp',small,[cv2.IMWRITE_WEBP_QUALITY,72])
