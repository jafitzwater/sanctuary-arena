# Hero select backdrop (t373u): Joseph-supplied D2R "Select Hero Class" art (refs/hero-select-bg.jpg).
# Removes the baked-in title/blurb text and the baked Sorceress lightning (drawn live on a canvas instead),
# then writes a 1920px WebP. Needs opencv-python-headless + numpy. Usage: python tools/hero-select-bg.py <src.jpg>
# t378u: `python tools/hero-select-bg.py --measure` prints each hero's mean luminance in the shipped WebP
# (diagnostic only since the x0.42 stand-back veil; boxes below mirror HERO_SPOTS x/top/feet/w).
# t389u: `python tools/hero-select-bg.py <src.jpg> <standing-back.png>` also pastes the approved standing-back
# base (all seven heroes shaded back, watermark painted out: /workspace/audit/heroselect-art-base.png) into the
# frame at (865,429), scale 1.0 (HERO_BASE in src/game/heroSelect.ts), feathered at its edges, and paints out
# the white hand cursor below the Sorceress.
# t389u polish: edge colour-match of the base (no seam) and a textured fill of the bolt/hand area above it.
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
BASE=cv2.imread(sys.argv[2]) if len(sys.argv)>2 else None
BASE_AT=(865,429)
H,W=src.shape[:2]; s=W/1024
def R(x0,y0,x1,y1): return int(x0*s),int(y0*s),int(x1*s),int(y1*s)
out=src.copy()
def nconv(img,known,sg):
    k=known.astype(np.float32); num=cv2.GaussianBlur(img*k[...,None],(0,0),sg)
    return num/(cv2.GaussianBlur(k,(0,0),sg)[...,None]+1e-6)
def smooth_fill(img,known):
    """low-frequency fill of the unknown pixels, coarse scales only where the fine ones have no support"""
    low=img.copy(); done=known.copy()
    for sg in (4,8,16,32,64):
        den=cv2.GaussianBlur(known.astype(np.float32),(0,0),sg); est=nconv(img,known,sg); sel=(den>0.15)&~done
        low[sel]=est[sel]; done|=sel
    return low
# 1) baked lightning (t389u polish: and, with the base, the old selected Sorceress's hand above it): the bolt and
# its halo are filled with a smooth colour fill plus the stone texture of the best-matching nearby wall patch, then the
# remaining low-frequency glow on the wall is taken back out of the lightness and the blue cast out of the colour
x0,y0,x1,y1=1600,200,2400,560
reg=src[y0:y1,x0:x1].astype(np.float32); h,w=reg.shape[:2]
b,g,r=reg[...,0],reg[...,1],reg[...,2]
zone=np.zeros((h,w),bool); zone[330-y0:500-y0,1840-x0:2140-x0]=True
core=(((b>110)&((b-r)>12))|((b>190)&(g>180)))&zone
warm=cv2.dilate(((r>b+10)&(r>80)).astype(np.uint8),np.ones((7,7),np.uint8))>0
if BASE is not None: core|=warm&zone&(np.mgrid[0:h,0:w][0]<470-y0)  # hand/staff tip: below 470 the base covers it
else: core&=~warm
hole=cv2.dilate(core.astype(np.uint8),np.ones((13,13),np.uint8))>0
low=smooth_fill(reg,~hole); low=np.where(hole[...,None],cv2.GaussianBlur(low,(0,0),3),low)
hf=reg-cv2.GaussianBlur(reg,(0,0),4)
ring=(cv2.dilate(hole.astype(np.uint8),np.ones((25,25),np.uint8))>0)&~hole
ys,xs=np.nonzero(hole); ry,rx=np.nonzero(ring); best=None
for dy in range(-120,121,6):
    for dx in range(-300,301,6):
        yy,xx,qy,qx=ys+dy,xs+dx,ry+dy,rx+dx
        if min(yy.min(),xx.min(),qy.min(),qx.min())<0 or max(yy.max(),qy.max())>=h or max(xx.max(),qx.max())>=w: continue
        if zone[yy,xx].any(): continue
        e=((hf[qy,qx]-hf[ry,rx])**2).mean()+0.3*((reg[qy,qx]-reg[ry,rx])**2).mean()
        if best is None or e<best[0]: best=(e,dy,dx)
_,dy,dx=best
donor=cv2.warpAffine(reg,np.float32([[1,0,-dx],[0,1,-dy]]),(w,h),borderMode=cv2.BORDER_REFLECT)
fill=low+donor-cv2.GaussianBlur(donor,(0,0),6)
a=np.maximum(cv2.GaussianBlur(hole.astype(np.float32),(0,0),3),hole)[...,None]
fixed=np.clip(reg*(1-a)+fill*a,0,255).astype(np.uint8)
lab=cv2.cvtColor(fixed,cv2.COLOR_BGR2LAB).astype(np.float32)
m=np.zeros((h,w),np.float32); cv2.ellipse(m,(1990-x0,430-y0),(180,70),0,0,360,1,-1)
# reference: the wall around and above the glow only (below it sits the capture's lit Sorceress)
mf=cv2.GaussianBlur(m,(0,0),14); kn=(m<0.5)&(np.mgrid[0:h,0:w][0]<400-y0)
L=lab[...,0]; lowL=cv2.GaussianBlur(L,(0,0),14); expL=nconv(np.dstack([L]*3),kn,28)[...,0]
lab[...,0]=L-np.minimum(np.clip(lowL-expL,0,None),0.5*lowL)*mf
ab=nconv(np.dstack([lab[...,1],lab[...,2],lab[...,2]]),kn,30)[...,:2]
lab[...,1:]=lab[...,1:]*(1-mf[...,None])+ab*mf[...,None]
out[y0:y1,x0:x1]=cv2.cvtColor(np.clip(lab,0,255).astype(np.uint8),cv2.COLOR_LAB2BGR)

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
# 3) t389u: standing-back base pasted over the heroes (feathered so the seam melts into the frame).
if BASE is not None:
    bh,bw=BASE.shape[:2]; X,Y=BASE_AT
    # t389u polish: colour-match the base to the frame near its edges (the approved base renders a touch greyer than
    # the capture), so the ramp below blends like for like instead of leaving a faint seam. Gain = frame/base at low
    # frequency where both show the same scenery (heroes differ: shaded back), full at the edge, none 160px inside.
    # The matched base is also written next to the input (-matched.png): hero-select-forward.py builds the plates from it.
    Bf=BASE.astype(np.float32); Of=out[Y:Y+bh,X:X+bw].astype(np.float32)
    gb=cv2.GaussianBlur(Bf,(0,0),20)+2; go=cv2.GaussianBlur(Of,(0,0),20)+2
    ratio=go/gb; lr=ratio.mean(2); same=(lr>0.65)&(lr<1.55)
    same[:560-Y,1780-X:2180-X]=False  # the capture's selected Sorceress and her bolt glow: not scenery
    gain=smooth_fill(np.where(same[...,None],ratio,1).astype(np.float32),same)
    gain=np.clip(cv2.GaussianBlur(gain,(0,0),12),0.6,1.6)
    yy,xx=np.mgrid[0:bh,0:bw].astype(np.float32)
    d=np.minimum.reduce([yy,bh-1-yy,xx,bw-1-xx]); wgt=np.clip(1-d/160,0,1); wgt=(wgt*wgt*(3-2*wgt))[...,None]
    BASE=np.clip(Bf*(1+(gain-1)*wgt),0,255).astype(np.uint8)
    cv2.imwrite(sys.argv[2][:-4]+'-matched.png',BASE)
    # linear ramps in from each edge (short at the top, where the capture's bolt glow sits just below the base edge)
    yy,xx=np.mgrid[0:bh,0:bw].astype(np.float32)
    a=np.minimum.reduce([yy/16,(bh-1-yy)/60,xx/60,(bw-1-xx)/60]).clip(0,1)
    a=(a*a*(3-2*a))[...,None]
    reg=out[Y:Y+bh,X:X+bw].astype(np.float32)
    out[Y:Y+bh,X:X+bw]=np.clip(BASE*a+reg*(1-a),0,255).astype(np.uint8)
    # 4) the white hand cursor of the original capture (bright, neutral, just below the Sorceress)
    cx0,cy0,cx1,cy1=1860,960,1990,1080
    reg=out[cy0:cy1,cx0:cx1].astype(int)
    cm=((reg.min(2)>120)&(np.ptp(reg,axis=2)<60)).astype(np.uint8)*255
    cm=cv2.dilate(cm,np.ones((9,9),np.uint8))
    full=np.zeros(out.shape[:2],np.uint8); full[cy0:cy1,cx0:cx1]=cm
    out=cv2.inpaint(out,full,7,cv2.INPAINT_TELEA)
small=cv2.resize(out,(1920,int(round(H*1920/W))),interpolation=cv2.INTER_AREA)
cv2.imwrite('public/ui/hero-select-bg.webp',small,[cv2.IMWRITE_WEBP_QUALITY,74])
