import glob
import json
import math
import sys

import numpy as np
import torch
import torch.nn.functional as F
import xarray as xr
from torch import nn

torch.manual_seed(0); np.random.seed(0)
E1, E2 = int(sys.argv[1]), int(sys.argv[2])
dev = "cuda"
R = "/kaggle/input/datasets/ayushkam/cube-v1"
g = lambda n: glob.glob(f"{R}/**/{n}", recursive=True)[0]
DEPTHS = [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000]
ds = xr.open_zarr(g("cube.zarr"))
clim = xr.open_dataset(g("clim.nc"))["clim"].values.astype("float32")
with open(g("norm_splits.json")) as source:
    J = json.load(source)
CH, SP, NM = J["channels"], J["splits"], J["norm"]
t = ds.time.values; doy = ds.time.dt.dayofyear.values
sel = {k: np.where((t >= np.datetime64(a)) & (t <= np.datetime64(b)))[0] for k, (a, b) in SP.items()}
om = ds.valid_ocean_mask.values.astype("float32")
X = np.stack([(ds[c].values - NM[c]["mean"]) / NM[c]["std"] for c in CH], 1).astype("float32")
X = np.nan_to_num(X) * om[None, None]
Y = ds.temp.values.astype("float32")
M = ~np.isnan(Y)
A = Y - clim[doy - 1]; del Y
sd = np.nanstd(A[sel["train"]], axis=(0, 2, 3)).astype("float32")
An = np.nan_to_num(A / sd[None, :, None, None]).astype("float32"); del A
Xt, Yt, Mt = torch.from_numpy(X), torch.from_numpy(An), torch.from_numpy(M)
sdt = torch.from_numpy(sd)[None, :, None, None]
om_d = torch.from_numpy(om)[None, None].to(dev)
lat_d = torch.from_numpy(((np.arange(101) * 0.25 + 5 - 17.5) / 12.5).astype("float32"))[None, None, :, None].expand(1, 1, 101, 241).to(dev)

def batch(idx):
    ii = torch.as_tensor(idx); B = len(idx)
    d = torch.from_numpy(doy[idx]).float().to(dev)[:, None, None, None]
    s = torch.sin(2 * math.pi * d / 365.25).expand(B, 1, 101, 241)
    c = torch.cos(2 * math.pi * d / 365.25).expand(B, 1, 101, 241)
    ctx = torch.cat([s, c, lat_d.expand(B, -1, -1, -1), om_d.expand(B, -1, -1, -1)], 1)
    return Xt[ii].to(dev), ctx, ii

class Blk(nn.Module):
    def __init__(s, c):
        super().__init__()
        s.a = nn.Sequential(nn.GroupNorm(8, c), nn.SiLU(), nn.Conv2d(c, c, 3, padding=1),
                            nn.GroupNorm(8, c), nn.SiLU(), nn.Conv2d(c, c, 3, padding=1))
    def forward(s, x): return x + s.a(x)
class Enc(nn.Module):
    def __init__(s):
        super().__init__()
        s.n = nn.Sequential(nn.Conv2d(12, 64, 3, padding=1), Blk(64), nn.Conv2d(64, 96, 3, stride=2, padding=1), Blk(96),
                            nn.Conv2d(96, 128, 3, stride=2, padding=1), Blk(128), Blk(128))
    def forward(s, x): return s.n(x)
class Dec(nn.Module):
    def __init__(s, o):
        super().__init__()
        s.n = nn.Sequential(Blk(128), nn.Upsample(scale_factor=2), nn.Conv2d(128, 96, 3, padding=1), Blk(96),
                            nn.Upsample(scale_factor=2), nn.Conv2d(96, 64, 3, padding=1), Blk(64),
                            nn.GroupNorm(8, 64), nn.SiLU(), nn.Conv2d(64, o, 1))
    def forward(s, z): return s.n(z)
class Net(nn.Module):
    def __init__(s):
        super().__init__(); s.enc, s.drec, s.dtmp = Enc(), Dec(7), Dec(15)
    def emb(s, inp): return s.enc(F.pad(inp, (0, 3, 0, 3)))
    def rec(s, inp): return s.drec(s.emb(inp))[..., :101, :241]
    def tmp(s, inp): return s.dtmp(s.emb(inp))[..., :101, :241]
model = Net().to(dev)
scaler = torch.amp.GradScaler("cuda")
tr = sel["train"]; BS = 8

def l_rec(idx):
    x, c, _ = batch(idx)
    hid = (torch.rand(x.shape[0], 1, 13, 31, device=dev) < 0.5).float().repeat_interleave(8, 2).repeat_interleave(8, 3)[:, :, :101, :241]
    keep = 1 - hid
    rec = model.rec(torch.cat([x * keep, c, keep], 1)).float()
    w = hid * om_d
    return (((rec - x) ** 2) * w).sum() / (w.sum() * 7 + 1e-6)

def l_tmp(idx):
    x, c, ii = batch(idx)
    p = model.tmp(torch.cat([x, c, torch.ones_like(x[:, :1])], 1)).float()
    y, m = Yt[ii].to(dev), Mt[ii].to(dev)
    mf = m.float()
    l = (F.huber_loss(p, y, reduction="none") * mf).sum() / mf.sum().clamp(min=1)
    mm = (m[:, 1:] & m[:, :-1]).float()
    lg = (((p[:, 1:] - p[:, :-1]) - (y[:, 1:] - y[:, :-1])).abs() * mm).sum() / mm.sum().clamp(min=1)
    return l + 0.1 * lg

@torch.no_grad()
def ev(name, save=False):
    model.eval(); ix = sel[name]; se = np.zeros(15); se0 = np.zeros(15); n = np.zeros(15); out = []
    for i in range(0, len(ix), 16):
        idx = ix[i:i + 16]; x, c, ii = batch(idx)
        with torch.autocast("cuda", dtype=torch.float16):
            p = model.tmp(torch.cat([x, c, torch.ones_like(x[:, :1])], 1))
        p = p.float().cpu() * sdt; y = Yt[ii] * sdt; m = Mt[ii]
        se += (((p - y) * m) ** 2).sum((0, 2, 3)).double().numpy()
        se0 += ((y * m) ** 2).sum((0, 2, 3)).double().numpy()
        n += m.sum((0, 2, 3)).double().numpy()
        if save: out.append(np.where(m.numpy(), clim[doy[idx] - 1] + p.numpy(), np.nan).astype("float32"))
    model.train()
    return np.sqrt(se / n), np.sqrt(se0 / n), (np.concatenate(out) if save else None)

def vscore():
    a, b, _ = ev("val"); return float(np.mean(a / b))

def fit(groups, epochs, lossfn, tag, evalfn=None):
    opt = torch.optim.AdamW(groups, weight_decay=1e-4)
    nb = len(tr) // BS
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[gp["lr"] for gp in groups], total_steps=epochs * nb)
    best = 1e9
    for ep in range(epochs):
        model.train(); perm = np.random.permutation(tr); tot = 0
        for i in range(nb):
            idx = np.sort(perm[i * BS:(i + 1) * BS])
            with torch.autocast("cuda", dtype=torch.float16): l = lossfn(idx)
            opt.zero_grad(set_to_none=True); scaler.scale(l).backward(); scaler.step(opt); scaler.update(); sch.step(); tot += l.item()
        msg = f"{tag} ep {ep + 1}/{epochs} train {tot / nb:.4f}"
        if evalfn:
            sc = evalfn(); msg += f" | val rmse/clim {sc:.4f}"
            if sc < best: best = sc; torch.save(model.state_dict(), "/kaggle/working/best.pt")
        print(msg, flush=True)

fit([{"params": list(model.enc.parameters()) + list(model.drec.parameters()), "lr": 2e-3}], E1, l_rec, "pretrain")
fit([{"params": list(model.enc.parameters()), "lr": 2e-4}, {"params": list(model.dtmp.parameters()), "lr": 1e-3}], E2, l_tmp, "decoder", vscore)
model.load_state_dict(torch.load("/kaggle/working/best.pt"))
res = {}
for nm in ["val", "test"]:
    a, b, pr = ev(nm, save=(nm == "test"))
    res[nm] = {"depth": DEPTHS, "model_rmse": a.round(3).tolist(), "clim_rmse": b.round(3).tolist()}
    print(nm, "depth | clim rmse | model rmse | skill vs clim")
    for d, x1, x0 in zip(DEPTHS, a, b): print(f"  {d:>5} m  {x0:6.3f}  {x1:6.3f}  {1 - (x1 / x0) ** 2:6.3f}")
    if pr is not None: np.save("/kaggle/working/pred_test.npy", pr)
with open("/kaggle/working/results.json", "w") as destination:
    json.dump(res, destination, indent=1)