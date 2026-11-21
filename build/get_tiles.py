import os, sys, time, json, threading, queue
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://assets-esa.pubg.plus/assets/map"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0 Safari/537.36",
      "Referer": "https://pubg.plus/"}

def fetch(url, dest, retries=4):
    if os.path.exists(dest) and os.path.getsize(dest) > 200:
        return os.path.getsize(dest)
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read()
            if len(data) < 200:
                return 0
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            return len(data)
        except Exception:
            time.sleep(0.6 * (i + 1))
    return -1

def job(args):
    m, z, x, y = args
    url = f"{BASE}/{m}/{z}_{x}_{y}.jpg"
    dest = os.path.join(OUTDIR, m, f"{z}_{x}_{y}.jpg")
    n = fetch(url, dest)
    return (m, z, n)

def download_map(m, zmin, zmax, workers=16):
    tasks = []
    for z in range(zmin, zmax + 1):
        n = 2 ** z
        for x in range(n):
            for y in range(n):
                tasks.append((m, z, x, y))
    total = 0
    fail = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for i, (mm, z, n) in enumerate(ex.map(job, tasks)):
            if n > 0:
                total += n
            else:
                fail += 1
    return total, fail, len(tasks), time.time() - t0

if __name__ == "__main__":
    OUTDIR = sys.argv[1]
    mapname = sys.argv[2]
    zmin, zmax = int(sys.argv[3]), int(sys.argv[4])
    t, f, n, dt = download_map(mapname, zmin, zmax)
    print(f"{mapname} z{zmin}-{zmax}: tiles={n} ok_bytes={t/1048576:.1f}MB fail={f} time={dt:.0f}s")
