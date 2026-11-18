"""Soundtrack for reel 5 ("one day, five frames"): warm, unhurried lo-fi, 90 BPM, 13 bars (~34.7 s).

Electric piano chords Gm9 - C9 - Fmaj7 - D7b9 (the last one a Hijaz turn back to G minor), a santur line, soft
low-passed kick and snare, shaker, vinyl crackle, and a gentle swell into each new photo (bars 1, 3, 5, 7, 9).

  bar 0       hook       chord, santur, clock ticks; no drums
  bars 1-10   five frames, two bars each
  bar 11      outro      film strip
  bar 12      end card   chord and santur only, so the loop restarts softly

Usage: python3 tools/music5.py build/music5.wav   (also writes build/kicks5.js)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import music as m  # noqa: E402
import music3 as m3  # noqa: E402

SR = m.SR
BPM = 90
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 13
DUR = BARS * BAR
N = int(round(DUR * SR))
S16 = BEAT / 4
rng = np.random.default_rng(5)

CHORDS = [[55, 58, 62, 65, 69], [48, 52, 55, 58, 62], [53, 57, 60, 64, 67], [50, 54, 57, 60, 63]]  # Gm9 C9 Fmaj7 D7b9
ROOTS = [43, 36, 41, 38]
# santur phrases (16th step, midi), one per chord; Hijaz colour on D7b9 (Eb, F#)
LINE = [[(0, 74), (6, 77), (8, 79), (12, 81)], [(0, 79), (4, 76), (8, 74), (14, 72)],
        [(0, 72), (6, 74), (8, 76), (12, 77)], [(0, 78), (4, 75), (8, 74), (12, 66)]]


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


def crackle() -> np.ndarray:
    x = m.hp(rng.standard_normal(N), 3000) * 0.004
    clicks = np.zeros(N)
    idx = rng.integers(0, N, int(DUR * 9))
    clicks[idx] = rng.uniform(0.05, 0.25, len(idx)) * rng.choice([-1, 1], len(idx))
    return x + m.lp(clicks, 6000)


def build() -> tuple[np.ndarray, list[float]]:
    drums, bass, keys, strings, fx = silence(), silence(), silence(), silence(), silence()
    side = np.ones(N)
    K = m.lp(m.kick(0.45), 1800)
    SN = m.lp(m.clap(), 3500)
    SH = m3.shaker()
    kicks: list[float] = []

    def kick_at(at: float, g: float = 0.8) -> None:
        add(drums, K, at, g)
        kicks.append(round(at, 4))
        i, n = int(at * SR), int(0.3 * SR)
        j = min(N, i + n)
        side[i:j] = np.minimum(side[i:j], 1 - 0.4 * np.exp(-np.arange(j - i) / SR / 0.09))

    for bar in range(BARS):
        c = bar % 4
        # keys: chord on the one, a softer push on the "and" of two
        add(keys, m3.epiano(CHORDS[c], BAR * 0.98, 0.7), tb(bar), 0.55)
        if 1 <= bar <= 11:
            add(keys, m3.epiano(CHORDS[c][1:4], BEAT * 1.5, 0.5), tb(bar, 6), 0.25)
        # santur line (an octave up in the second bar of each frame)
        for step, note in LINE[c]:
            add(strings, m3.santur(note + (12 if bar % 2 == 0 and bar > 0 else 0), 1.6), tb(bar, step), 0.2)
        # bass and drums
        if 1 <= bar <= 11:
            for step, ln in ((0, 5), (10, 3), (14, 2)):
                add(bass, m3.sub(ROOTS[c], S16 * ln * 0.95), tb(bar, step), 0.6)
            for step in (0, 10):
                kick_at(tb(bar, step), 0.75)
            for step in (4, 12):
                add(drums, SN, tb(bar, step), 0.32)
            for s in range(0, 16, 2):
                add(drums, SH, tb(bar, s), 0.06 if s % 4 else 0.035)
    # hook: clock ticks
    for k in range(8):
        add(fx, m.tick(), tb(0, k * 2), 0.25 if k % 2 == 0 else 0.14)
    # a soft swell + santur glissando into each new photo, and a quiet shutter
    for bar in (1, 3, 5, 7, 9, 11):
        add(fx, m.reverse_cymbal(1.1), tb(bar) - 1.1, 0.35)
        for k, note in enumerate((74, 77, 79, 81, 84, 86)):
            add(strings, m3.santur(note, 0.9), tb(bar) - 0.35 + k * 0.05, 0.09)
        add(fx, m.shutter(), tb(bar) - 0.05, 0.35)
    add(fx, m.shutter(), tb(12) - 0.05, 0.5)

    strings = m.reverb(m.delay(strings, BEAT * 0.75, 0.35, 0.3), 2.6, 0.35)
    mix = m.reverb(drums, 0.5, 0.08) + bass * side * 0.8 + m.reverb(keys, 2.2, 0.3) * side**0.5 * 0.85 + strings + m.reverb(fx, 1.5, 0.25) + crackle()
    mix = m.lp(mix, 12000)
    mix = m.hp(mix, 30)
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix *= 10 ** (-1 / 20) / max(1e-9, np.max(np.abs(mix)))
    f = int(0.01 * SR)
    mix[:f] *= np.linspace(0, 1, f)
    mix[-f:] *= np.linspace(1, 0, f)
    return mix, sorted(set(kicks))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "build/music5.wav"
    mix, kicks = build()
    m.write(out, mix)
    Path(out).with_name("kicks5.js").write_text(f"window.KICKS = {json.dumps(kicks)};\nwindow.BPM = {BPM};\n")
    print(f"{out}: {DUR:.2f}s, {BPM} BPM, {BARS} bars, {len(kicks)} kicks")
