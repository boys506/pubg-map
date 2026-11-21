import json, os, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw = json.load(open(os.path.join(ROOT, 'capture/raw/1_map_list.json'), encoding='utf-8'))['data']
points = json.load(open(os.path.join(ROOT, 'capture/points.json'), encoding='utf-8'))

LABEL = {
    'Erangel': ('艾伦格', 'Erangel'),
    'Miramar': ('米拉玛', 'Miramar'),
    'Sanhok': ('萨诺', 'Sanhok'),
    'Vikendi': ('维寒迪', 'Vikendi'),
    'Karakin': ('卡拉金', 'Karakin'),
    'Paramo': ('帕拉莫', 'Paramo'),
    'Haven': ('褐湾', 'Haven'),
    'Taego': ('泰戈', 'Taego'),
    'Deston': ('帝斯顿', 'Deston'),
    'Rondo': ('荣都', 'Rondo'),
}
SIZE = {'Erangel': 8, 'Miramar': 8, 'Sanhok': 4, 'Karakin': 2, 'Paramo': 3,
        'Haven': 1, 'Vikendi': 8, 'Taego': 8, 'Deston': 8, 'Rondo': 8}

types = []
type_index = {}
for t in raw[3]:
    key, zh, en, ko, color, svg = t
    type_index[key] = len(types)
    types.append({'key': key, 'zh': zh, 'en': en, 'color': color, 'svg': svg})

maps = []
for entry in raw[4]:
    name = entry[0]
    packed = entry[1] if len(entry) > 1 and isinstance(entry[1], list) else entry[1:]
    groups = []
    for i in range(0, len(packed) - 4, 5):
        idx, cnt, tag, img, imgsize = packed[i], packed[i + 1], packed[i + 2], packed[i + 3], packed[i + 4]
        if not isinstance(idx, int) or idx >= len(types):
            continue
        groups.append({'key': types[idx]['key'], 'count': cnt, 'note': tag if isinstance(tag, str) else ''})
    if name not in LABEL:
        continue
    zh, en = LABEL[name]
    maps.append({'key': name, 'zh': zh, 'en': en, 'sizeKm': SIZE.get(name, 8), 'types': groups})

# points -> normalized [x, y] in 0..1 (x = p1/256, y = -p0/256)
norm = {}
total = 0
for m, bytype in points.items():
    norm[m] = {}
    for tkey, arr in bytype.items():
        out = []
        for p in arr:
            x = round(p[1] / 256, 4)
            y = round(-p[0] / 256, 4)
            if 0 <= x <= 1 and 0 <= y <= 1:
                out.append([x, y])
        if out:
            norm[m][tkey] = out
            total += len(out)

# order maps: 8km first then smaller
order = ['Erangel', 'Miramar', 'Taego', 'Deston', 'Rondo', 'Vikendi', 'Sanhok', 'Paramo', 'Karakin', 'Haven']
maps.sort(key=lambda m: order.index(m['key']) if m['key'] in order else 99)

data = {'version': '2026-11-21', 'types': types, 'maps': maps, 'points': norm}
outdir = os.path.join(ROOT, 'app', 'data')
os.makedirs(outdir, exist_ok=True)
with open(os.path.join(outdir, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.PUBG_DATA=')
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')

print('maps', len(maps), 'types', len(types), 'points', total,
      'size', round(os.path.getsize(os.path.join(outdir, 'data.js')) / 1024), 'KB')
for m in maps:
    print(' ', m['key'], m['zh'], 'types', len(m['types']),
          'pts', sum(len(v) for v in norm.get(m['key'], {}).values()))
