"""3뷰 렌더 시트에서 각 뷰를 잘라 배경 제거 -> 투명 PNG.
배경이 완전한 무채색(Lab a=b=128)이라 채도로 캐릭터를 분리하고, 무채색 그림자는 제외한다."""
import sys, cv2, numpy as np

SRC = "/root/.claude/uploads/91e15501-85f4-51eb-982c-410754fb90a0/"
SHEETS = {"persephone": "b3da1071", "sato": "219f87df", "jasmine": "577a14e7"}
VIEWS = ["front", "side", "back"]
OUT = sys.argv[1]

def fg_mask(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    chroma = np.hypot(lab[:, :, 1] - 128, lab[:, :, 2] - 128)
    chroma = cv2.GaussianBlur(chroma, (0, 0), 1.0)
    m = (chroma > 3.2).astype(np.uint8) * 255
    return m, lab

def fill_holes(m, min_area=0):
    inv = 255 - m
    n, lbl, st, _ = cv2.connectedComponentsWithStats(inv)
    out = m.copy()
    for i in range(1, n):
        x, y, w, h = st[i, :4]
        touches = x == 0 or y == 0 or x + w >= m.shape[1] or y + h >= m.shape[0]
        if not touches:
            out[lbl == i] = 255
    return out

for name, f in SHEETS.items():
    img = cv2.imread(f"{SRC}{f}-image.png")
    H, W = img.shape[:2]
    keep = int(H * 0.86) if name == "jasmine" else H   # 자스민 시트 하단 라벨 제외
    work = img[:keep].copy()
    m, lab = fg_mask(work)
    m[int(H * 0.88):, int(W * 0.92):] = 0   # 우하단 스파클 마크 제거
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    m = fill_holes(m)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lbl, st, _ = cv2.connectedComponentsWithStats(m)
    comps = [(st[i, 4], i) for i in range(1, n)]
    comps.sort(reverse=True)
    big = sorted([i for a, i in comps[:3]], key=lambda i: st[i, 0])
    assert len(big) == 3, (name, len(big))
    for v, i in zip(VIEWS, big):
        fg = np.where(lbl == i, 255, 0).astype(np.uint8)
        # 같은 시트에서 더듬이 등 가는 부분이 분리됐을 수 있어 가까운 조각 병합
        x, y, w, h = st[i, :4]
        pad = 60
        reg = np.zeros_like(fg)
        x0, x1, y0, y1 = max(0, x - pad), min(W, x + w + pad), max(0, y - pad), min(keep, y + h + pad)
        for a, j in comps[3:]:
            if a < 150: continue
            jx, jy, jw, jh = st[j, :4]
            if jx >= x0 and jx + jw <= x1 and jy >= y0 and jy + jh <= y1:
                fg[lbl == j] = 255
        fg = fill_holes(cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)))
        fg = cv2.erode(fg, np.ones((3, 3), np.uint8))
        alpha = cv2.GaussianBlur(fg, (0, 0), 1.0)
        rgba = cv2.cvtColor(work, cv2.COLOR_BGR2BGRA)
        rgba[:, :, 3] = alpha
        ys, xs = np.where(alpha > 8)
        rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        th = 360
        if rgba.shape[0] > th:
            sc = th / rgba.shape[0]
            rgba = cv2.resize(rgba, (round(rgba.shape[1] * sc), th), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f"{OUT}/{name}_{v}.png", rgba)
        print(name, v, rgba.shape)
