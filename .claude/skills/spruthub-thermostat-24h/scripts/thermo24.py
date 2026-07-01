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
import argparse, glob, os, sys, zipfile, tempfile, json
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
        return None, mx

    off = TZ_OFFSET_HOURS * 3600
    data = {}
    for key, (a, s, c) in STREAMS.items():
        rows = con.execute(
            f"select (timestamp/1000+{off}) ts, value from allh "
            f"where a_id={a} and s_id={s} and c_id={c} and timestamp>{lo} order by timestamp"
        ).fetchall()
        data[key] = [(datetime.utcfromtimestamp(t), v) for t, v in rows]
    end_local = datetime.utcfromtimestamp(mx / 1000 + off)
    return data, end_local


def parse_hm(day, hm):
    h, m = hm.split(":")
    return day.replace(hour=int(h), minute=int(m), second=0, microsecond=0)


def build_chart(data, end_local, out_png, ymin, ymax, x_from, x_to):
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
    af.step(fx, fv, where="post", color="#9a7bbf", lw=1.3, alpha=.85, label="вентилятор (0–3)")
    af.set_ylim(0, 12); af.set_yticks([0, 1, 2, 3])
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
    p.add_argument("--list", action="store_true", help="показать доступные потоки и выйти")
    a = p.parse_args()

    zip_path = a.zip or find_latest_devinfo(a.downloads)
    print("DevInfo:", os.path.basename(zip_path))
    data, end_local = load_history(zip_path, a.hours, want_list=a.list)
    if a.list:
        return
    stamp = end_local.strftime("%Y-%m-%d")
    outdir = a.outdir or os.path.join(os.getcwd(), "charts")
    os.makedirs(outdir, exist_ok=True)
    out = a.out or os.path.join(outdir, f"vt_last24h_{stamp}.png")
    build_chart(data, end_local, out, a.ymin, a.ymax, a.x_from, a.x_to)


if __name__ == "__main__":
    main()
