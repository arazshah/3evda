"""Soundtrack for reel 2 ("try not to get hungry"): original "Persian phonk", 140 BPM, 10 bars (~17.1 s).

Phonk palette made from code: pitched 808 cowbell playing a D Hijaz riff, gliding distorted 808 bass, hard clap,
hats with rolls. Instruments shared with music.py are imported from it.

  bar 0      hook       cowbell riff alone, snare roll, reverse cymbal -> impact
  bars 1-6   challenge  full beat, a whoosh on every photo (each 2 beats)
  bar 7      "you lost" impact, half-time, a falling "wah"
  bar 8      cta        full beat again
  bar 9      loop       beats 0-1 full, beats 2-3 riff alone, so the reel restarts seamlessly

Writes the wav and build/kicks2.js (kick times, so the picture can punch on every kick).
Usage: python3 tools/music2.py build/music2.wav
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import music as m  # noqa: E402

SR = m.SR
BPM = 140
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 10
DUR = BARS * BAR
N = int(round(DUR * SR))
S16 = BEAT / 4
rng = np.random.default_rng(7)


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


def cowbell(freq: float, length: float = 0.22) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    sq = lambda f: np.sign(np.sin(2 * np.pi * f * t))  # noqa: E731
    x = sq(freq) * 0.6 + sq(freq * 1.4836) * 0.4
    x = m.bp(x, freq * 0.8, min(freq * 4, 16000))
    e = np.exp(-t / 0.035) * 0.6 + np.exp(-t / 0.16) * 0.4
    return np.tanh(2.2 * x * e)


def bass808(midi_from: float, midi_to: float, length: float, glide: float = 0.06) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f0, f1 = m.midi(midi_from), m.midi(midi_to)
    f = f1 + (f0 - f1) * np.exp(-t / max(glide, 1e-3))
    f = f * (1 + 0.8 * np.exp(-t / 0.012))  # punch at the start
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    e = np.clip(t / 0.003, 0, 1) * np.exp(-t / 0.55) * np.clip((length - t) / 0.03, 0, 1)
    return np.tanh(3.0 * x * e) * 0.8


def wah_down(length: float = 1.2) -> np.ndarray:  # "you lost" falling tone
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 520 * (0.35 ** (t / length))
    x = m.saw(f, n) * 0.5 + np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5
    wob = 0.5 + 0.5 * np.sin(2 * np.pi * 6 * t)
    x = m.svf(x, 400 + 1800 * wob * np.exp(-t / 0.8), "low", 2.0)
    return x * np.clip(t / 0.02, 0, 1) * np.exp(-t / 0.6)


def deg(d: int, octave: int = 0) -> int:
    return m.deg(d, octave)


RIFF_A = [(0, 7), (3, 8), (6, 7), (8, 4), (10, 5), (12, 4), (14, 1)]
RIFF_B = [(0, 7), (3, 8), (6, 9), (8, 8), (10, 7), (12, 5), (14, 4)]
PROG = [0, 0, 5, 6]


def build() -> tuple[np.ndarray, list[float]]:
    drums, bass, bells, fx = silence(), silence(), silence(), silence()
    side = np.ones(N)
    K, C, H = m.kick(0.5), m.clap(), m.hat()
    kicks: list[float] = []

    def kick_at(at: float, g: float = 1.0) -> None:
        add(drums, K, at, g)
        kicks.append(round(at, 4))
        i, n = int(at * SR), int(0.2 * SR)
        j = min(N, i + n)
        side[i:j] = np.minimum(side[i:j], 1 - 0.6 * np.exp(-np.arange(j - i) / SR / 0.05))

    def riff(bar: int, gain: float = 0.32) -> None:
        for step, d in RIFF_A if bar % 2 == 0 else RIFF_B:
            add(bells, cowbell(m.midi(deg(d, 2))), tb(bar, step), gain)

    full = lambda bar, step: bar in (1, 2, 3, 4, 5, 6, 8) or (bar == 9 and step < 8)  # noqa: E731

    # ---- hook
    riff(0, 0.38)
    for k, step in enumerate([12, 13, 14, 15, 15.5]):
        add(drums, C, tb(0, step), 0.25 + 0.1 * k)
    add(fx, m.reverse_cymbal(0.8), tb(1) - 0.8, 0.8)
    add(fx, m.impact(2.0), tb(1), 0.9)

    # ---- grooves
    prev = deg(0, -1)
    for bar in range(BARS):
        if bar in (1, 2, 3, 4, 5, 6, 8, 9):
            riff(bar)
        root = deg(PROG[bar % 4], -1)
        for step in range(16):
            if not full(bar, step):
                continue
            if step in (0, 6, 10):
                kick_at(tb(bar, step))
                target = root + (12 if step == 10 and bar % 2 else 0)
                add(bass, bass808(prev, target, S16 * (6 if step == 0 else 4), 0.05 if step != 10 else 0.12), tb(bar, step), 0.9)
                prev = target
            if step in (4, 12):
                add(drums, C, tb(bar, step), 0.7)
            if step % 2 == 0:
                add(drums, H, tb(bar, step), 0.16 if step % 4 else 0.1)
        if bar in (2, 4, 6, 8):  # hat roll into the next bar
            for r in range(8):
                add(drums, H, tb(bar, 14) + r * S16 / 4, 0.08 + 0.02 * r)

    # ---- bar 7: "you lost"
    kick_at(tb(7))
    add(fx, m.impact(2.4), tb(7), 1.0)
    add(fx, m.shutter(), tb(7) - 0.1, 1.1)
    add(bass, bass808(deg(0, 0), deg(0, -2), BAR * 0.9, 0.5), tb(7), 0.9)
    add(fx, wah_down(1.1), tb(7, 1), 0.5)
    kick_at(tb(7, 8), 0.9)
    add(drums, C, tb(7, 8), 0.8)
    for step, d in RIFF_B[:4]:
        add(bells, cowbell(m.midi(deg(d, 2))), tb(7, 8 + step / 2), 0.25)
    add(fx, m.reverse_cymbal(0.6), tb(8) - 0.6, 0.7)

    # ---- transitions: a whoosh into every photo (bars 1-6, each 2 beats)
    for k in range(12):
        add(fx, m.whoosh(0.3), tb(1, k * 8) - 0.18, 0.35)
    add(fx, m.shutter(), tb(1) - 0.08, 0.9)

    # loop tail: riff alone over bar 9 beats 2-3 (already played by riff(9)), drone under it
    mix = m.reverb(drums, 0.7, 0.06) + bass * side * 0.95 + m.delay(bells, BEAT * 0.75, 0.3, 0.25) * side**0.5 + m.reverb(fx, 1.4, 0.18)
    mix = m.hp(mix, 28)
    mix = np.tanh(mix * 1.5) / np.tanh(1.5)
    mix *= 10 ** (-1 / 20) / max(1e-9, np.max(np.abs(mix)))
    f = int(0.008 * SR)
    mix[:f] *= np.linspace(0, 1, f)
    mix[-f:] *= np.linspace(1, 0, f)
    return mix, sorted(set(kicks))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "build/music2.wav"
    mix, kicks = build()
    m.write(out, mix)
    Path(out).with_name("kicks2.js").write_text(f"window.KICKS = {json.dumps(kicks)};\nwindow.BPM = {BPM};\n")
    print(f"{out}: {DUR:.2f}s, {BPM} BPM, {BARS} bars, {len(kicks)} kicks")
