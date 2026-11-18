"""Soundtrack for reel 4 ("5 decisions"): minimal cinematic pulse, 120 BPM, 15 bars = 30 s.

A ticking hook, then a tense eighth-note bass ostinato with a santur arpeggio that grows chapter by chapter; every
chapter opens on a camera shutter and a low hit (the reel's sonic signature). Outro: full groove and santur lead.

  bars 0-1    hook       clock ticks, drone, heartbeat
  bars 2-11   chapters   five chapters of two bars, each opening on shutter + hit; layers added as it goes
  bar 11      build      riser in the last two beats
  bars 12-13  outro      full groove, santur lead
  bar 14      end card   chord and santur, stripped back for the loop

Usage: python3 tools/music4.py build/music4.wav   (also writes build/kicks4.js)
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
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 15
DUR = BARS * BAR
N = int(round(DUR * SR))
S16 = BEAT / 4

CHORDS = [[50, 53, 57, 62], [46, 50, 53, 58], [48, 51, 55, 60], [45, 49, 52, 57]]  # Dm Bb Cm A (minor, Hijaz turn at A)
ROOTS = [38, 34, 36, 33]
ARP = [[74, 77, 81, 86], [70, 74, 77, 82], [72, 75, 79, 84], [69, 73, 76, 81]]


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


def pad(notes: list[int], length: float, cutoff: float) -> np.ndarray:
    return m.pad(notes, length, cutoff)


def build() -> tuple[np.ndarray, list[float]]:
    drums, bass, keys, strings, fx = silence(), silence(), silence(), silence(), silence()
    side = np.ones(N)
    K, C, H, SH = m.kick(0.45), m.clap(), m.hat(), m3.shaker()
    kicks: list[float] = []

    def kick_at(at: float, g: float = 0.9) -> None:
        add(drums, K, at, g)
        kicks.append(round(at, 4))
        i, n = int(at * SR), int(0.25 * SR)
        j = min(N, i + n)
        side[i:j] = np.minimum(side[i:j], 1 - 0.55 * np.exp(-np.arange(j - i) / SR / 0.07))

    # ---- hook: ticking clock, drone, heartbeat
    for k in range(16):
        add(fx, m.tick(), tb(0, k * 2), 0.32 if k % 2 == 0 else 0.18)
    add(keys, pad([38, 45, 50], 2 * BAR, 700), 0, 0.7)
    for b in (0, 1):
        add(drums, m.kick(0.3), tb(b, 0), 0.55)
        add(drums, m.kick(0.3), tb(b, 2.5), 0.4)
    add(fx, m.riser(BAR), tb(1), 0.35)

    # ---- chapters (bars 2-11) + outro (12-13) + end (14)
    for bar in range(2, BARS):
        c = bar % 4
        chapter = (bar - 2) // 2 if bar < 12 else 5
        # bass ostinato (8ths), not on the end card
        if bar != 14:
            for e in range(8):
                if bar == 11 and e >= 6:
                    break
                add(bass, m3.sub(ROOTS[c] + (12 if e % 4 == 3 else 0), BEAT / 2 * 0.85), tb(bar, e * 2), 0.75)
        # pad chord
        add(keys, pad(CHORDS[c], BAR, 900 + 300 * min(chapter, 5)), tb(bar), 0.45 if bar < 12 else 0.35)
        # santur arpeggio, denser in later chapters
        step = 4 if chapter < 2 else 2
        for s in range(0, 16, step):
            add(strings, m3.santur(ARP[c][(s // step) % 4], 1.2), tb(bar, s), 0.16 + 0.02 * min(chapter, 4))
        # drums grow: half-time kick -> four on the floor; clap from chapter 3; hats from chapter 2
        if bar == 14:
            kick_at(tb(bar), 0.8)
            continue
        beats = (0, 2) if chapter < 3 else (0, 1, 2, 3)
        for b in beats:
            if bar == 11 and b == 3:
                continue
            kick_at(tb(bar, b * 4), 0.85)
        if chapter >= 2:
            for b in (1, 3):
                if not (bar == 11 and b == 3):
                    add(drums, C, tb(bar, b * 4), 0.4 if chapter < 5 else 0.55)
        if chapter >= 1:
            for s in range(16):
                add(drums, SH if s % 2 else H, tb(bar, s), 0.07 if s % 2 else 0.05)
        if bar in (12, 13):
            for st, note, ln in m3.LEAD:
                add(strings, m3.santur(note - 12, 1.3), tb(bar, st), 0.3)

    # ---- chapter openings: shutter + low hit + whoosh
    for k in range(5):
        at = tb(2 + 2 * k)
        add(fx, m.shutter(), at - 0.06, 1.1)
        add(fx, m.impact(1.4), at, 0.5)
        add(fx, m.whoosh(0.35), at - 0.25, 0.4)
    # ---- build and outro
    add(fx, m.riser(BAR), tb(11), 0.55)
    add(fx, m.reverse_cymbal(0.8), tb(12) - 0.8, 0.8)
    add(fx, m.impact(2.0), tb(12), 0.9)
    add(fx, m.shutter(), tb(14) - 0.06, 0.9)

    strings = m.reverb(m.delay(strings, BEAT * 0.75, 0.3, 0.25), 2.2, 0.3)
    mix = m.reverb(drums, 0.6, 0.06) + bass * side * 0.85 + m.reverb(keys, 1.8, 0.25) * side**0.5 * 0.8 + strings + m.reverb(fx, 1.5, 0.2)
    mix = m.hp(mix, 28)
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    mix *= 10 ** (-1 / 20) / max(1e-9, np.max(np.abs(mix)))
    f = int(0.008 * SR)
    mix[:f] *= np.linspace(0, 1, f)
    mix[-f:] *= np.linspace(1, 0, f)
    return mix, sorted(set(kicks))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "build/music4.wav"
    mix, kicks = build()
    m.write(out, mix)
    Path(out).with_name("kicks4.js").write_text(f"window.KICKS = {json.dumps(kicks)};\nwindow.BPM = {BPM};\n")
    print(f"{out}: {DUR:.2f}s, {BPM} BPM, {BARS} bars, {len(kicks)} kicks")
