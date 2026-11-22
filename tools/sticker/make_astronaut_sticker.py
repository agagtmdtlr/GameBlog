"""우주인 사진을 잡지에서 오린 스티커 그림으로 만든다 (Pillow, NumPy).

python -I tools/sticker/make_astronaut_sticker.py tools/sticker/astronaut-source.png src/assets/astronaut-sticker.png preview.png

1. 균일한 배경색(245, 245, 247)을 가장자리부터 채워(허용 오차 6) 우주인만 남긴다.
2. 둘레를 넓혀 외곽선을 따고, 곧은 선분 여러 개로 줄여 가위로 오린 듯한 종이 테두리를 만든다.
3. 사진을 조금 따뜻하고 흐리게 바꾸고 인쇄 입자를 더해 잡지 사진처럼 보이게 한다. 종이에도 결과 접힘 음영을 넣는다.
4. 오른쪽 아래로 옅은 그림자를 드리워 붙인 느낌을 내고, 512×512 투명 칸 가운데에 맞춘다.
"""
import sys, numpy as np
from collections import deque
from PIL import Image, ImageFilter
src, out, preview = sys.argv[1], sys.argv[2], sys.argv[3]  # 원본, 결과 PNG, 어두운 배경 미리보기
img = Image.open(src).convert('RGB')
a = np.asarray(img).astype(np.int32)
h, w, _ = a.shape
bg = np.array([245, 245, 247])
diff = np.abs(a - bg).max(axis=2)
TOL = int(sys.argv[4]) if len(sys.argv) > 4 else 6
# flood fill background from the border
bgmask = np.zeros((h, w), bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        q.append((y, x))
while q:
    y, x = q.popleft()
    if bgmask[y, x] or diff[y, x] > TOL: continue
    bgmask[y, x] = True
    if y > 0: q.append((y - 1, x))
    if y < h - 1: q.append((y + 1, x))
    if x > 0: q.append((y, x - 1))
    if x < w - 1: q.append((y, x + 1))
fg = Image.fromarray((~bgmask * 255).astype(np.uint8))
# clean: open (remove specks) then close
fg = fg.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
fg = fg.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))

# work on a padded canvas so the border fits
PAD = 40
W, H = w + PAD * 2, h + PAD * 2
def padded(im, fill):
    c = Image.new(im.mode, (W, H), fill); c.paste(im, (PAD, PAD)); return c
fgp = padded(fg, 0)
art = padded(img, (245, 245, 247))

# scissor-cut paper border: dilate, smooth, then straighten into a hand-cut polygon look via low-res threshold
BORDER = 11
m = fgp
for _ in range(BORDER // 2):
    m = m.filter(ImageFilter.MaxFilter(5))
m = m.filter(ImageFilter.GaussianBlur(5)).point(lambda v: 255 if v > 100 else 0)
rng = np.random.default_rng(7)
# scissor cut: trace the outer outline and simplify it into straight cuts
mb = np.asarray(m) > 0
def trace(mask):
    hh, ww = mask.shape
    ys, xs = np.nonzero(mask)
    i = np.lexsort((xs, ys))[0]
    start = (ys[i], xs[i])
    dirs = [(-1,0),(-1,1),(0,1),(1,1),(1,0),(1,-1),(0,-1),(-1,-1)]
    pts = [start]; cur = start; back = 6
    for _ in range(200000):
        for k in range(8):
            d = (back + 1 + k) % 8
            ny, nx = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
            if 0 <= ny < hh and 0 <= nx < ww and mask[ny, nx]:
                back = (d + 4) % 8
                cur = (ny, nx)
                break
        if cur == start: break
        pts.append(cur)
    return np.array([(x, y) for y, x in pts], float)
def dp(p, eps):
    if len(p) < 3: return p
    a, b = p[0], p[-1]
    ab = b - a; n = np.hypot(*ab)
    d = np.abs(ab[0] * (p[:, 1] - a[1]) - ab[1] * (p[:, 0] - a[0])) / n if n > 0 else np.hypot(*(p - a).T)
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([dp(p[:i + 1], eps)[:-1], dp(p[i:], eps)])
    return np.array([a, b])
contour = trace(mb)
half = len(contour) // 2
poly = np.vstack([dp(contour[:half + 1], 3.2)[:-1], dp(contour[half:], 3.2)])
poly += rng.normal(0, 1.2, poly.shape)
from PIL import ImageDraw
SS = 4
big = Image.new('L', (W * SS, H * SS), 0)
ImageDraw.Draw(big).polygon([tuple(v) for v in (poly * SS + SS / 2)], fill=255)
paper = big.resize((W, H), Image.LANCZOS)
paper = Image.fromarray(np.maximum(np.asarray(paper), np.asarray(fgp.filter(ImageFilter.MaxFilter(5)))))

# magazine print feel: slightly warm, a touch less contrast, fine print grain
artf = np.asarray(art).astype(float) / 255
artf = 0.06 + artf * 0.9
artf = artf * np.array([1.0, 0.985, 0.95])
grain = rng.normal(0, 0.025, (H, W, 1))
artf = np.clip(artf + grain, 0, 1)
paper_col = np.array([0.985, 0.975, 0.95]) + rng.normal(0, 0.012, (H, W, 1))
fga = np.asarray(fgp.filter(ImageFilter.GaussianBlur(0.7))).astype(float)[..., None] / 255
rgb = paper_col * (1 - fga) + artf * fga
# faint fold/crease shading across the paper
yy, xx = np.mgrid[0:H, 0:W]
rgb *= (1 - 0.05 * np.clip((xx * 0.6 + yy * 0.8 - (W * 0.6 + H * 0.8) * 0.55) / 40, -1, 1)[..., None] * 0.5)
alpha = np.asarray(paper).astype(float) / 255

# soft drop shadow (pasted-on look)
sh = paper.filter(ImageFilter.GaussianBlur(5))
sha = np.zeros((H, W)); sa = np.asarray(sh).astype(float) / 255
sha[6:, 5:] = sa[:-6, :-5] * 0.45
out_a = alpha + sha * (1 - alpha)
out_rgb = (rgb * alpha[..., None]) / np.maximum(out_a, 1e-6)[..., None]
res = np.dstack([np.clip(out_rgb, 0, 1), out_a])
im = Image.fromarray((res * 255).astype(np.uint8), 'RGBA')
im = im.crop(im.getbbox())
# fit into a 512 square cell
S = 512
sc = (S - 8) / max(im.size)
im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
cell = Image.new('RGBA', (S, S), (0, 0, 0, 0))
cell.paste(im, ((S - im.width) // 2, (S - im.height) // 2))
cell.save(out, optimize=True)
bgv = Image.new('RGBA', (S, S), (12, 14, 30, 255)); bgv.alpha_composite(cell); bgv.convert('RGB').save(preview)
print('fg px', (~bgmask).sum(), 'size', im.size)
