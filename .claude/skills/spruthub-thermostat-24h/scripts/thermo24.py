#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
thermo24.py — суточный график виртуального термостата Sprut.Hub из DevInfo.

Источник данных: архив отладочной информации хаба
  Настройки -> "..." -> Скачать отладочную информацию  (Sprut.Hub_DevInfo_*.zip)
Внутри лежит числовая история ВСЕХ показаний:
  External/Bridges/History/1/history.duckdb  (+ .wal свежий буфер)
  External/Bridges/History/1/segments/YYYY/MM/*.parquet  (по суткам)
Таблица History(timestamp_ms, a_id, s_id, c_id, type, value). Время в БД — UTC.

Делает: берёт самый свежий DevInfo из папки, выгружает нужные потоки за последние
N часов, строит ОДИН график (единая шкала температуры) и сохраняет PNG.

Запуск:
  python3 thermo24.py
  python3 thermo24.py --downloads ~/Downloads --hours 24 --ymin 20
  python3 thermo24.py --from 08:00 --to 20:00            # окно по локальному времени суток отчёта
  python3 thermo24.py --zip /path/Sprut.Hub_DevInfo_2026.06.29-03_19_44.zip
  python3 thermo24.py --list                              # показать доступные потоки и выйти

Зависимости: pip install duckdb matplotlib  (--break-system-packages при необходимости)
"""
import argparse, glob, os, sys, zipfile, tempfile, json, re, tarfile
from datetime import datetime, timedelta

# --- Местное смещение времени относительно UTC в БД (MSK = +3) ---
TZ_OFFSET_HOURS = 3

# --- Потоки истории (a_id, s_id, c_id). Поправь под свой хаб через --list ---
STREAMS = {
    "room":   (8,  13, 15),   # комната — внешний датчик SNZB-02D (вход термостата)
    "out":    (17, 13, 15),   # улица — LUMI weather
    "ac_cur": (22, 17, 21),   # датчик самого кондея (внутр., возвратный воздух)
    "ac_tgt": (22, 17, 22),   # целевая температура, которую сценарий шлёт в кондей
    "ac_fan": (22, 17, 24),   # скорость вентилятора кондея (1..3)
}
# Двери-герконы (a_id -> имя), c_id=15, значение 1=открыто. Важны для нагрузки на кондей.
# ВАЖНО: ContactSensor шлёт только изменения — состояние реконструируем непрерывно
# (затравка последним событием до окна + перенос через границы). Не фильтровать по дню!
DOORS = {
    4: "дверь кухня",   # Aqara MCCGQ11LM, serial 00158D0009F5C5A7
    # 5:  "дверь коридор",
    # 24: "дверь Саша",
}
# Агрегация состояния двери для подсветки: бьём на бакеты и красим бакет «открыто»,
# если дверь была открыта >= DOOR_OPEN_THRESH доли времени бакета (схлопывает дёрганья).
DOOR_BUCKET_MIN = 30     # размер бакета, мин
DOOR_OPEN_THRESH = 0.5   # доля открытого времени в бакете, чтобы считать «открыто»

# Прод-уставки термостата (для коридора/цели на графике)
TARGET = 24.3
CORRIDOR = (24.0, 24.6)
LOW_FLAG = 23.8   # отметить провалы комнаты ниже этого


def find_latest_devinfo(folder):
    cands = glob.glob(os.path.join(folder, "Sprut.Hub_DevInfo_*.zip"))
    if not cands:
        sys.exit(f"Не найден Sprut.Hub_DevInfo_*.zip в {folder}. Скачай отладочную информацию из хаба.")
    return max(cands, key=os.path.getmtime)


def load_history(zip_path, hours, want_list=False):
    import duckdb
    tmp = tempfile.mkdtemp(prefix="devinfo_")
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(tmp)
    base = os.path.join(tmp, "External", "Bridges", "History", "1")
    db = os.path.join(base, "history.duckdb")
    segs = sorted(glob.glob(os.path.join(base, "segments", "*", "*", "*.parquet")))
    if not os.path.exists(db) and not segs:
        sys.exit("В архиве нет истории (External/Bridges/History/1). Это точно DevInfo, а не логи?")
    con = duckdb.connect()
    parts = []
    if os.path.exists(db):
        con.execute("attach '%s' as h (read_only)" % db)
        parts.append("select timestamp,a_id,s_id,c_id,value from h.History")
    if segs:
        pq = "', '".join(segs)
        parts.append("select timestamp,a_id,s_id,c_id,value from read_parquet(['%s'])" % pq)
    con.execute("create view allh as " + " union all ".join(parts))
    mx = con.execute("select max(timestamp) from allh").fetchone()[0]
    lo = mx - hours * 3600 * 1000

    if want_list:
        rows = con.execute(f"""
            select a_id,s_id,c_id,count(*) n,round(min(value),2) vmin,round(max(value),2) vmax
            from allh where timestamp>{lo} group by 1,2,3 order by 1,2,3""").fetchall()
        print("Потоки за последние %d ч (a_id s_id c_id | n | min..max):" % hours)
        for r in rows:
            print("  %3d %3d %3d | %5d | %6s .. %-6s" % (r[0], r[1], r[2], r[3], r[4], r[5]))
        return None, mx, {}

    off = TZ_OFFSET_HOURS * 3600
    data = {}
    for key, (a, s, c) in STREAMS.items():
        rows = con.execute(
            f"select (timestamp/1000+{off}) ts, value from allh "
            f"where a_id={a} and s_id={s} and c_id={c} and timestamp>{lo} order by timestamp"
        ).fetchall()
        data[key] = [(datetime.utcfromtimestamp(t), v) for t, v in rows]
    end_local = datetime.utcfromtimestamp(mx / 1000 + off)

    # Двери: непрерывная реконструкция состояния (затравка + перенос)
    doors = {}
    lo_s, mx_s = lo / 1000 + off, mx / 1000 + off
    for aid, name in DOORS.items():
        seed = con.execute(
            f"select value from allh where a_id={aid} and c_id=15 and timestamp<{lo} "
            f"order by timestamp desc limit 1").fetchone()
        state = int(seed[0]) if seed else 0
        evs = con.execute(
            f"select (timestamp/1000+{off}) ts, value from allh "
            f"where a_id={aid} and c_id=15 and timestamp>{lo} order by timestamp").fetchall()
        iv, cur = [], (lo_s if state == 1 else None)
        for t, v in evs:
            v = int(v)
            if v == 1 and cur is None:
                cur = t
            elif v == 0 and cur is not None:
                iv.append((cur, t)); cur = None
        if cur is not None:
            iv.append((cur, mx_s))
        merged = []
        for a0, b0 in iv:                       # склеить разрывы < 90 c
            if merged and a0 - merged[-1][1] <= 90:
                merged[-1] = (merged[-1][0], b0)
            else:
                merged.append((a0, b0))
        if merged:
            doors[name] = [(datetime.utcfromtimestamp(a0), datetime.utcfromtimestamp(b0))
                           for a0, b0 in merged]
    return data, end_local, doors


def parse_hm(day, hm):
    h, m = hm.split(":")
    return day.replace(hour=int(h), minute=int(m), second=0, microsecond=0)


def door_open_buckets(intervals, bucket_min, thresh):
    """Схлопнуть события двери в бакеты: вернуть интервалы, где дверь была открыта
    >= thresh доли бакета. Частые открыл/закрыл превращаются в основное состояние."""
    if not intervals:
        return []
    step = timedelta(minutes=bucket_min)
    lo = min(a for a, _ in intervals)
    hi = max(b for _, b in intervals)
    grid0 = lo.replace(hour=0, minute=0, second=0, microsecond=0)
    k = int((lo - grid0).total_seconds() // (bucket_min * 60))
    t = grid0 + k * step
    buckets = []
    while t < hi:
        b0, b1 = t, t + step
        span = (b1 - b0).total_seconds()
        op = 0.0
        for a, b in intervals:
            s = max(a, b0); e = min(b, b1)
            if e > s:
                op += (e - s).total_seconds()
        if span > 0 and op / span >= thresh:
            buckets.append((b0, b1))
        t = b1
    merged = []
    for a, b in buckets:                       # склеить соседние «открытые» бакеты
        if merged and a <= merged[-1][1] + timedelta(seconds=1):
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged


def build_chart(data, end_local, out_png, ymin, ymax, x_from, x_to, doors=None,
                door_bucket=DOOR_BUCKET_MIN, door_thresh=DOOR_OPEN_THRESH):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates

    def xy(k):
        return [t for t, _ in data[k]], [v for _, v in data[k]]

    # продлить ступенчатые ряды до конца окна
    for k in ("ac_tgt", "ac_fan"):
        if data[k]:
            data[k].append((end_local, data[k][-1][1]))

    plt.rcParams.update({"font.size": 11, "font.family": "DejaVu Sans"})
    fig, ax = plt.subplots(figsize=(13, 7), dpi=135)
    fig.patch.set_facecolor("white")

    ax.axhspan(CORRIDOR[0], CORRIDOR[1], color="#33cc88", alpha=0.10, zorder=0)
    ax.axhline(TARGET, color="#199e70", ls="--", lw=1.3, zorder=2, label=f"цель {TARGET}°")

    # подсветка «дверь открыта» — агрегированно по бакетам (основное состояние)
    if doors:
        first = True
        for name, iv in doors.items():
            for a0, b0 in door_open_buckets(iv, door_bucket, door_thresh):
                ax.axvspan(a0, b0, color="#e07a2c", alpha=0.16, zorder=1,
                           label=(f"дверь: преим. открыта (бакет {door_bucket}м)" if first else None))
                first = False

    ox, oy = xy("out");    ax.plot(ox, oy, color="#5a8f3c", lw=1.8, label="улица")
    cx, cy = xy("ac_cur"); ax.plot(cx, cy, color="#d8742a", lw=1.2, alpha=.8, label="датчик кондея (внутр.)")
    tx, tv = xy("ac_tgt"); ax.step(tx, tv, where="post", color="#b5611f", lw=1.5, ls=(0, (5, 2)), label="целевая кондея")
    rx, ry = xy("room");   ax.plot(rx, ry, color="#1f6fd6", lw=2.4, zorder=5, label="комната (внешн. датчик)")
    lx = [t for t, v in data["room"] if v < LOW_FLAG]
    ly = [v for _, v in data["room"] if v < LOW_FLAG]
    if lx:
        ax.scatter(lx, ly, s=40, color="#e34948", zorder=6, label=f"комната <{LOW_FLAG}°")

    ax.set_ylim(ymin, ymax); ax.set_ylabel("температура, °C"); ax.grid(axis="y", alpha=.2)

    af = ax.twinx()
    fx, fv = xy("ac_fan")
    af.step(fx, fv, where="post", color="#9a7bbf", lw=1.3, alpha=.85, label="вентилятор (0–5)")
    af.set_ylim(0, 20); af.set_yticks([0, 1, 2, 3, 4, 5])
    af.set_ylabel("вентилятор", color="#5f2d80"); af.tick_params(axis="y", labelcolor="#5f2d80")

    day = end_local if end_local.hour >= 6 else end_local - timedelta(days=1)
    lo_x = parse_hm(day, x_from) if x_from else min(rx + ox)
    hi_x = parse_hm(day, x_to) if x_to else end_local
    ax.set_xlim(lo_x, hi_x)
    span_h = max(1, (hi_x - lo_x).total_seconds() / 3600)
    ax.xaxis.set_major_locator(mdates.HourLocator(interval=1 if span_h <= 14 else 2))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M"))

    h1, l1 = ax.get_legend_handles_labels(); h2, l2 = af.get_legend_handles_labels()
    ax.legend(h1 + h2, l1 + l2, loc="upper left", fontsize=9, ncol=3, framealpha=.92)
    ax.set_title("Гостиная — термостат, все показатели, единая шкала температуры (%g–%g°C)" % (ymin, ymax),
                 fontsize=11)
    fig.tight_layout()
    fig.savefig(out_png, facecolor="white")
    print("saved", out_png)


def load_scenario_options(zip_path):
    """Живые опции сценария из DevInfo: SQL/SprutHub/Recover/*.tar.gz -> SprutHub.data.
    Возвращает список dict'ов (по одному на термостат-конфиг с ключом fanTempStep)."""
    tmp = tempfile.mkdtemp(prefix="devopt_")
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():
            if "/Recover/" in n and n.endswith(".tar.gz"):
                z.extract(n, tmp)
    recs = sorted(glob.glob(os.path.join(tmp, "**", "Recover", "*.tar.gz"), recursive=True))
    if not recs:
        return []
    rt = tempfile.mkdtemp()
    with tarfile.open(recs[-1]) as t:      # последний по имени = свежайший снимок
        t.extractall(rt)
    cand = glob.glob(os.path.join(rt, "**", "SprutHub.data"), recursive=True)
    if not cand:
        return []
    raw = open(cand[0], "rb").read().decode("latin-1", "ignore")
    out = []
    for b in re.findall(r'\{[^{}]*?"fanTempStep"[^{}]*?\}', raw):
        try:
            out.append(json.loads(b))
        except Exception:
            pass
    return out


def print_options(opts, full=True):
    if not opts:
        print("опции сценария: не найдены в DevInfo (нет Recover/SprutHub.data)")
        return
    keys = ["hysteresis", "acSmoothFactor", "acAnticipate", "fanTempStep",
            "acCoolTemp", "acHeatTemp", "acFanOnlyFrom", "acFanOnlyTo",
            "acModulateAtTarget", "acFanOnlyAtTarget", "acFanControl",
            "fanSpeedManualLock", "emulateThermostat", "failureBehavior",
            "failureTimeout", "debug", "sensor", "acThermostat", "acPowerSwitch"]
    for o in opts:
        tag = f"датчик {o.get('sensor','?')} / кондей {o.get('acThermostat','?')}"
        if full:
            print(f"\n=== Опции сценария ({tag}) ===")
            for k in keys:
                if k in o:
                    print(f"  {k:18} = {o[k]}")
        else:
            print("опции: гистерезис %s, сила %s, упреждение %s, fanTempStep %s  (%s)" % (
                o.get("hysteresis"), o.get("acSmoothFactor"), o.get("acAnticipate"),
                o.get("fanTempStep"), tag))


def print_doors(doors, win_lo, win_hi):
    if not doors:
        return
    tot = max(1.0, (win_hi - win_lo).total_seconds())
    for name, iv in doors.items():
        op = 0.0
        for a0, b0 in iv:
            s = max(a0, win_lo); e = min(b0, win_hi)
            if e > s:
                op += (e - s).total_seconds()
        print("%s: открыта %d%% окна (~%d мин)" % (name, round(100 * op / tot), round(op / 60)))


def main():
    p = argparse.ArgumentParser(description="Суточный график термостата Sprut.Hub из DevInfo")
    p.add_argument("--downloads", default=os.path.expanduser("~/Downloads"))
    p.add_argument("--zip", default=None, help="конкретный DevInfo zip (иначе берётся свежий)")
    p.add_argument("--hours", type=int, default=24)
    p.add_argument("--ymin", type=float, default=20.0)
    p.add_argument("--ymax", type=float, default=29.0)
    p.add_argument("--from", dest="x_from", default=None, help="начало окна, напр. 08:00")
    p.add_argument("--to", dest="x_to", default=None, help="конец окна, напр. 20:00")
    p.add_argument("--outdir", default=None, help="папка для PNG (по умолчанию ./charts)")
    p.add_argument("--out", default=None, help="полный путь PNG (переопределяет --outdir)")
    p.add_argument("--door-bucket", type=int, default=DOOR_BUCKET_MIN,
                   help="агрегация двери: размер бакета в минутах (по умолч. 30)")
    p.add_argument("--door-thresh", type=float, default=DOOR_OPEN_THRESH,
                   help="доля открытого времени в бакете для метки 'открыто' (0..1, по умолч. 0.5)")
    p.add_argument("--list", action="store_true", help="показать доступные потоки и выйти")
    p.add_argument("--options", action="store_true", help="показать живые опции сценария и выйти")
    a = p.parse_args()

    zip_path = a.zip or find_latest_devinfo(a.downloads)
    print("DevInfo:", os.path.basename(zip_path))
    if a.options:
        print_options(load_scenario_options(zip_path), full=True)
        return
    data, end_local, doors = load_history(zip_path, a.hours, want_list=a.list)
    if a.list:
        return
    try:
        print_options(load_scenario_options(zip_path), full=False)
    except Exception:
        pass
    print_doors(doors, end_local - timedelta(hours=a.hours), end_local)
    stamp = end_local.strftime("%Y-%m-%d")
    outdir = a.outdir or os.path.join(os.getcwd(), "charts")
    os.makedirs(outdir, exist_ok=True)
    out = a.out or os.path.join(outdir, f"vt_last24h_{stamp}.png")
    build_chart(data, end_local, out, a.ymin, a.ymax, a.x_from, a.x_to, doors=doors,
                door_bucket=a.door_bucket, door_thresh=a.door_thresh)


if __name__ == "__main__":
    main()
