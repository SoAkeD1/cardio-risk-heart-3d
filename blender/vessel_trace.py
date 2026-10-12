"""Trace the painted coronary lines on a (theta, z') unwrap of the heart (numpy only -> runs inside Blender).

vesselness = local darkness of the base-colour texture (box-blurred luminance minus luminance).
Each vessel is a minimum-cost path through (1 - vesselness) inside an anatomical window, found by dynamic
programming with a slope limit, so the tube follows the painted line wherever one exists and stays smooth.
"""
from __future__ import annotations

import numpy as np


def box_blur(a, ry, rx):
    """Separable box blur with wrap-around in x (theta) and edge clamping in y."""
    a = np.asarray(a, float)
    pad = np.concatenate([a[:, -rx:], a, a[:, :rx]], axis=1)
    c = np.cumsum(np.pad(pad, ((0, 0), (1, 0))), axis=1)
    a = (c[:, 2 * rx + 1:] - c[:, :-2 * rx - 1]) / (2 * rx + 1)
    padv = np.concatenate([np.repeat(a[:1], ry, 0), a, np.repeat(a[-1:], ry, 0)], axis=0)
    c = np.cumsum(np.pad(padv, ((1, 0), (0, 0))), axis=0)
    return (c[2 * ry + 1:] - c[:-2 * ry - 1]) / (2 * ry + 1)


def vesselness(rgb, ok, r=4):
    L = rgb.mean(2)
    L = np.where(ok, L, np.nanmean(L[ok]) if ok.any() else 0.5)
    dark = np.clip(box_blur(L, r, r) - L, 0, None)
    dark = box_blur(dark, 1, 1)                       # light smoothing
    v = dark / (np.percentile(dark[ok], 99.5) + 1e-9)
    return np.clip(v, 0, 1) * ok


def dp_path(cost, rows, start_cols, col_lo, col_hi, max_step, end_cols=None, step_penalty=0.02):
    """Minimum-cost path through cost[rows[0]..rows[-1], :] (rows in order, may be descending).
    col_lo/col_hi: per-row allowed window (arrays aligned with `rows`, integer column indices in an array whose
    columns are already rolled so every window is contiguous). Returns column index per row."""
    nr = len(rows)
    ncol = cost.shape[1]
    INF = 1e18
    D = np.full((nr, ncol), INF)
    back = np.zeros((nr, ncol), int)
    mask0 = np.zeros(ncol, bool)
    mask0[list(start_cols)] = True
    D[0] = np.where(mask0, cost[rows[0]], INF)
    shifts = range(-max_step, max_step + 1)
    for k in range(1, nr):
        prev = D[k - 1]
        best = np.full(ncol, INF)
        arg = np.zeros(ncol, int)
        for s in shifts:
            cand = np.full(ncol, INF)
            if s >= 0:
                cand[s:] = prev[:ncol - s] if s else prev
            else:
                cand[:s] = prev[-s:]
            cand = cand + step_penalty * abs(s)
            better = cand < best
            best[better] = cand[better]
            arg[better] = s
        win = np.zeros(ncol, bool)
        win[max(0, col_lo[k]):min(ncol, col_hi[k] + 1)] = True
        D[k] = np.where(win, best + cost[rows[k]], INF)
        back[k] = arg
    last = D[-1].copy()
    if end_cols is not None:
        m = np.zeros(ncol, bool)
        m[list(end_cols)] = True
        last = np.where(m, last, INF)
    c = int(np.argmin(last))
    path = [c]
    for k in range(nr - 1, 0, -1):
        c = c - back[k, c]
        path.append(c)
    return np.array(path[::-1]), float(D[-1].min())


class Unwrap:
    """Helper around the (theta, z') grid: rolled column indexing so windows never cross the seam."""

    def __init__(self, thetas, zs, v, ok):
        self.th, self.zs, self.v, self.ok = np.asarray(thetas), np.asarray(zs), v, ok
        self.dth = float(self.th[1] - self.th[0])
        self.dz = float(self.zs[1] - self.zs[0])
        self.cost = 1.0 - 0.95 * v + (~ok) * 5.0

    def row(self, z):
        return int(np.clip(round((z - self.zs[0]) / self.dz), 0, len(self.zs) - 1))

    def col(self, theta):
        return int(round(((theta - self.th[0]) % 360) / self.dth)) % len(self.th)

    def trace_vertical(self, z_from, z_to, theta_start, window, max_dtheta_per_mm=6.0, start_tol=4.0,
                       theta_end=None, end_tol=None):
        """Path progressing in z' (e.g. LAD, PDA, diagonals). window(z) -> (theta_lo, theta_hi) in a continuous
        range (may exceed +-180). Returns arrays theta(deg), z(m)."""
        roll = self.col(theta_start) - len(self.th) // 2       # put the start in the middle of the array
        cost = np.roll(self.cost, -roll, axis=1)
        step = 1 if z_to > z_from else -1
        rows = list(range(self.row(z_from), self.row(z_to) + step, step))
        mid = len(self.th) // 2

        def to_col(t):                                           # continuous theta -> rolled column
            return mid + int(round((t - theta_start) / self.dth))
        lo = np.array([to_col(window(self.zs[r])[0]) for r in rows])
        hi = np.array([to_col(window(self.zs[r])[1]) for r in rows])
        starts = range(to_col(theta_start - start_tol), to_col(theta_start + start_tol) + 1)
        ends = None
        if theta_end is not None:
            ends = range(to_col(theta_end - end_tol), to_col(theta_end + end_tol) + 1)
        max_step = max(1, int(round(max_dtheta_per_mm * self.dz * 1000 / self.dth)))
        cols, _ = dp_path(cost, rows, starts, lo, hi, max_step, ends)
        theta = theta_start + (cols - mid) * self.dth
        return theta, self.zs[rows]

    def trace_horizontal(self, th_from, th_to, z_start, window, max_dz_per_deg=0.35, start_tol=0.004,
                         z_end=None, end_tol=None):
        """Path progressing in theta (e.g. LCX / RCA in the AV groove). th_from/th_to continuous (may run
        decreasing, may pass +-180). window(theta) -> (z_lo, z_hi) in metres."""
        n = int(round(abs(th_to - th_from) / self.dth)) + 1
        thetas = np.linspace(th_from, th_to, n)
        cols = [self.col(t) for t in thetas]
        costT = self.cost[:, cols].T                            # rows = theta steps, cols = z
        rows = list(range(n))
        lo = np.array([self.row(window(t)[0]) for t in thetas])
        hi = np.array([self.row(window(t)[1]) for t in thetas])
        starts = range(self.row(z_start - start_tol), self.row(z_start + start_tol) + 1)
        ends = None
        if z_end is not None:
            ends = range(self.row(z_end - end_tol), self.row(z_end + end_tol) + 1)
        max_step = max(1, int(round(max_dz_per_deg * self.dth / (self.dz * 1000))))   # mm/deg -> z rows per column
        zi, _ = dp_path(costT, rows, starts, lo, hi, max_step, ends)
        return thetas, self.zs[zi]

    def strength(self, theta, z):
        """Mean vesselness along a path (how well it sits on a painted line)."""
        return float(np.mean([self.v[self.row(zz), self.col(tt)] for tt, zz in zip(theta, z)]))


def support_smooth(theta, z, strength, along="z", iters=60, lam=0.5, floor=0.15):
    """Weighted smoothing of a traced path: points on a painted line (high vesselness) stay put, unsupported
    points relax toward their neighbours -> no zig-zag where the texture has no line."""
    a = np.array(theta if along == "z" else z, float)
    w = np.clip((np.asarray(strength) - floor) / (0.6 - floor), 0, 1)
    for _ in range(iters):
        b = a.copy()
        b[1:-1] = (1 - lam * (1 - w[1:-1])) * a[1:-1] + lam * (1 - w[1:-1]) * 0.5 * (a[:-2] + a[2:])
        a = b
    return (a, np.asarray(z)) if along == "z" else (np.asarray(theta), a)


def path_strength(U, theta, z):
    return np.array([U.v[U.row(zz), U.col(tt)] for tt, zz in zip(theta, z)])
