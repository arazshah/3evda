"""Soundtrack for reel 3 (site tour): original deep house with a Persian colour, 120 BPM, 15 bars = 30 s.

A plucked-string santur (Karplus-Strong, four detuned strings per course) plays a D Hijaz motif over FM electric-piano
chords (D7 - Gm7 - Cm7 - D7b9), a warm sub bass, soft kick, clap and shaker. Shared instruments come from music.py.

  bar 0       hook       four chord stabs (one per hard cut) and a santur tremolo
  bar 1-2     intro      filtered kick and shaker, santur motif
  bar 3-9     tour       full groove; impacts on the two "pop-out" moments (8.0 s and 12.0 s)
  bar 10      build      riser and snare roll
  bar 11-13   drop       full groove and santur lead
  bar 14      end card   chords and santur, stripped back for the loop

Usage: python3 tools/music3.py build/music3.wav   (also writes build/kicks3.js)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import music as m  # noqa: E402

SR = m.SR
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 15
DUR = BARS * BAR
N = int(round(DUR * SR))
S16 = BEAT / 4
rng = np.random.default_rng(11)

CHORDS = [[50, 54, 57, 60], [55, 58, 62, 65], [48, 51, 55, 58], [50, 54, 57, 63]]  # D7 Gm7 Cm7 D7b9
ROOTS = [38, 43, 36, 38]
# santur motif: (16th step, midi) per chord, Hijaz tones around D5
MOTIF = [
    [(0, 74), (2, 78), (3, 79), (4, 81), (6, 78), (8, 75), (10, 74), (12, 78), (14, 81)],
    [(0, 79), (2, 82), (3, 81), (4, 79), (6, 74), (8, 77), (10, 79), (12, 82), (14, 86)],
    [(0, 84), (2, 82), (3, 79), (4, 75), (6, 79), (8, 82), (10, 84), (12, 82), (14, 79)],
    [(0, 78), (2, 79), (3, 78), (4, 75), (6, 74), (8, 78), (10, 75), (12, 74), (14, 69)],
]
LEAD = [(0, 86, 3), (3, 87, 1), (4, 86, 2), (6, 84, 2), (8, 82, 4), (12, 81, 2), (14, 79, 2)]


def silence() -> np.ndarray:
    return np.zeros(N)


def add(track: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(round(at * SR))
    if i >= N or i < 0:
        return
    j = min(N, i + len(sig))
    track[i:j] += sig[: j - i] * gain


def tb(bar: float, step: float = 0) -> float:
    return bar * BAR + step * S16


_ks_cache: dict[tuple[int, float], np.ndarray] = {}


def santur(note: int, length: float = 1.4) -> np.ndarray:
    key = (note, length)
    if key in _ks_cache:
        return _ks_cache[key]
    n = int(length * SR)
    out = np.zeros(n)
    for detune in (-0.12, -0.04, 0.05, 0.13):  # four strings per course, slightly apart
        f = m.midi(note + detune)
        p = int(SR / f)
        buf = (rng.random(p) * 2 - 1) * np.hanning(p) ** 0.3
        y = np.empty(n)
        b = buf.tolist()
        idx = 0
        damp = 0.4985
        for i in range(n):
            j = idx % p
            nxt = (idx + 1) % p
            v = b[j]
            b[j] = damp * (v + b[nxt])
            y[i] = v
            idx += 1
        out += y
    t = np.arange(n) / SR
    hammer = m.hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.004) * 0.3
    sig = m.hp(out / 4, 120) + hammer
    sig *= np.clip((length - t) / 0.08, 0, 1)
    _ks_cache[key] = sig
    return sig


def epiano(notes: list[int], length: float, bright: float = 1.0) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for note in notes:
        f = m.midi(note)
        idx = (1.6 * bright) * np.exp(-t / 0.4) + 0.2
        x += np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t)) * np.exp(-t / 1.6)
        x += np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.05) * 0.05  # tine
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
    e = np.clip(t / 0.004, 0, 1) * np.clip((length - t) / 0.1, 0, 1)
    return x / len(notes) * trem * e


def sub(note: int, length: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = m.midi(note)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    e = np.clip(t / 0.006, 0, 1) * np.clip((length - t) / 0.03, 0, 1) * np.exp(-t / 0.5)
    return np.tanh(1.8 * x * e) * 0.8


def shaker() -> np.ndarray:
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    return m.bp(rng.standard_normal(n), 5000, 11000) * np.sin(np.pi * np.clip(t / 0.07, 0, 1)) ** 2


def tap() -> np.ndarray:  # soft UI tap
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.008) * 0.6


def build() -> tuple[np.ndarray, list[float]]:
    drums, bass, keys, strings, fx = silence(), silence(), silence(), silence(), silence()
    side = np.ones(N)
    K, C, SH, H = m.kick(0.4), m.clap(), shaker(), m.hat(True)
    kicks: list[float] = []

    def kick_at(at: float, g: float = 0.85) -> None:
        add(drums, m.lp(K, 3500), at, g)
        kicks.append(round(at, 4))
        i, n = int(at * SR), int(0.25 * SR)
        j = min(N, i + n)
        side[i:j] = np.minimum(side[i:j], 1 - 0.55 * np.exp(-np.arange(j - i) / SR / 0.07))

    # ---- hook: four stabs, one per hard cut
    for beat in range(4):
        ch = CHORDS[beat % 4]
        add(keys, epiano([x + 12 for x in ch], BEAT * 0.95, 1.4), tb(0, beat * 4), 0.9)
        add(bass, sub(ROOTS[beat % 4], BEAT * 0.9), tb(0, beat * 4), 0.9)
        add(fx, m.impact(0.5), tb(0, beat * 4), 0.35)
        kicks.append(round(tb(0, beat * 4), 4))
    for k in range(16):  # santur tremolo rising
        add(strings, santur(74 + [0, 4, 5, 7][k % 4] + 12 * (k // 8), 0.6), tb(0, k), 0.18 + 0.01 * k)
    add(fx, m.whoosh(0.6), tb(1) - 0.35, 0.7)

    groove = lambda bar: bar in range(1, 10) or bar in (11, 12, 13)  # noqa: E731
    for bar in range(1, BARS):
        c = bar % 4
        # keys: offbeat chord pulses (deep house), whole bar pad on the end card
        if bar == 14:
            add(keys, epiano(CHORDS[0], BAR, 0.7), tb(bar), 0.8)
        elif bar != 10 or True:
            for step in (2, 6, 10, 14) if bar >= 3 else (6, 14):
                add(keys, epiano(CHORDS[c], S16 * 3, 0.9), tb(bar, step), 0.45)
        # santur motif (louder lead line in the drop)
        if bar >= 1:
            for step, note in MOTIF[c]:
                add(strings, santur(note), tb(bar, step), 0.22 if bar < 11 else 0.16)
        if bar in (11, 12, 13):
            for step, note, ln in LEAD:
                add(strings, santur(note - 12 + 12, 1.2), tb(bar, step), 0.28)
                add(strings, santur(note - 12, 1.2), tb(bar, step), 0.14)
        # drums
        if groove(bar) or bar in (10, 14):
            for beat in range(4):
                if bar == 10 and beat >= 2:
                    continue
                if bar == 14 and beat >= 2:
                    continue
                kick_at(tb(bar, beat * 4), 0.6 if bar <= 2 else 0.85)
                if bar >= 3 and beat in (1, 3):
                    add(drums, C, tb(bar, beat * 4), 0.45)
                if bar >= 2:
                    add(drums, H, tb(bar, beat * 4 + 2), 0.12)
            for s in range(16):
                if bar == 10 and s >= 8:
                    break
                add(drums, SH, tb(bar, s), 0.09 if s % 2 else 0.05)
        # bass: deep-house offbeat pattern from bar 2
        if bar >= 2 and bar != 14:
            r = ROOTS[c]
            for step, ln, oct_ in ((0, 3, 0), (3, 2, 0), (6, 2, 12), (8, 3, 0), (11, 2, 0), (14, 2, 7)):
                if bar == 10 and step >= 8:
                    break
                add(bass, sub(r + oct_, S16 * ln * 0.95), tb(bar, step), 0.7)

    # filter the intro open (bars 1-2)
    a, b = int(tb(1) * SR), int(tb(3) * SR)
    drums[a:b] = m.svf(drums[a:b].copy(), 400 * (20 ** np.linspace(0, 1, b - a) ** 2), "low", 0.8)

    # ---- pop-outs: impact + whoosh + tap
    for at in (8.0, 12.0):
        add(fx, tap(), at - 0.25, 0.6)
        add(fx, m.whoosh(0.4), at - 0.2, 0.6)
        add(fx, m.impact(1.2), at, 0.55)
    for at in (18.5, 19.25):  # taps on the quote form
        add(fx, tap(), at, 0.5)
    # ---- build into the drop
    add(fx, m.riser(BAR), tb(10), 0.6)
    at = tb(10, 8)
    for k, s in enumerate([2, 2, 1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5]):
        add(drums, C, at, 0.2 + 0.05 * k)
        at += s * S16
    add(fx, m.reverse_cymbal(0.8), tb(11) - 0.8, 0.8)
    add(fx, m.impact(2.2), tb(11), 0.9)
    add(fx, m.shutter(), tb(14) - 0.08, 0.8)

    strings = m.reverb(m.delay(strings, BEAT * 0.75, 0.3, 0.25), 2.0, 0.28)
    mix = m.reverb(drums, 0.6, 0.06) + bass * side * 0.9 + m.reverb(keys, 1.6, 0.2) * side**0.6 * 0.8 + strings * 0.9 + m.reverb(fx, 1.4, 0.2)
    mix = m.hp(mix, 28)
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    mix *= 10 ** (-1 / 20) / max(1e-9, np.max(np.abs(mix)))
    f = int(0.008 * SR)
    mix[:f] *= np.linspace(0, 1, f)
    mix[-f:] *= np.linspace(1, 0, f)
    return mix, sorted(set(kicks))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "build/music3.wav"
    mix, kicks = build()
    m.write(out, mix)
    Path(out).with_name("kicks3.js").write_text(f"window.KICKS = {json.dumps(kicks)};\nwindow.BPM = {BPM};\n")
    print(f"{out}: {DUR:.2f}s, {BPM} BPM, {BARS} bars, {len(kicks)} kicks")
