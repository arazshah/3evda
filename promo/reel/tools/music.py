"""The reel's soundtrack: an original, synthesised 128 BPM track, 16 bars = exactly 30 s.

Everything is generated from code (no samples, no third-party audio), so the track is free to publish anywhere.
The melody uses the D Hijaz scale (D Eb F# G A Bb C) for a Persian colour over a modern trailer/EDM beat.

Sections (bar = 1.875 s), matching scenes/timeline in reel.html:
  0      hook      ticking clock, low drone, a shutter click and a camera flash impact at the end
  1-2    reveal    four-on-the-floor kick with an opening filter, bass enters
  3-7    montage   full groove: kick, clap, hats, sidechained bass, Hijaz arp
  8-9    break     drums out, pad chords, riser, snare roll
  10-13  drop      everything + lead, impact on the downbeat
  14-15  cta       drop continues, last bar strips back to the drone so the loop restarts seamlessly

Usage: python3 tools/music.py out.wav [--no-music]   (--no-music keeps only sound effects)
"""

from __future__ import annotations

import sys
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
BPM = 128
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 16
DUR = BARS * BAR  # 30.0 s
N = int(round(DUR * SR))
rng = np.random.default_rng(3)


def t_of(bar: float, beat: float = 0.0) -> float:
    return bar * BAR + beat * BEAT


def silence() -> np.ndarray:
    return np.zeros(N)


def add(track: np.ndarray, sig: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(round(at * SR))
    if i >= N:
        return
    j = min(N, i + len(sig))
    track[i:j] += sig[: j - i] * gain


def env(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def lp(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, min(f, SR / 2.2), "low", fs=SR, output="sos"), x)


def hp(x: np.ndarray, f: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return sosfilt(butter(2, [lo, hi], "band", fs=SR, output="sos"), x)


def svf(x: np.ndarray, cutoff: np.ndarray, mode: str = "low", q: float = 0.7) -> np.ndarray:
    """State-variable filter with a per-sample cutoff: smooth sweeps without chunk-boundary clicks."""
    f = 2 * np.sin(np.pi * np.clip(cutoff, 20, SR / 6) / SR)
    damp = 1 / q
    low = band = 0.0
    out = np.empty_like(x)
    xs, fs = x.tolist(), f.tolist()
    want_low = mode == "low"
    for i in range(len(xs)):
        fi = fs[i]
        low += fi * band
        high = xs[i] - low - damp * band
        band += fi * high
        out[i] = low if want_low else band
    return out


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(freq: float | np.ndarray, n: int, phase: float = 0.0) -> np.ndarray:
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = (np.cumsum(f) / SR + phase) % 1.0
    return 2 * ph - 1


# ---------------------------------------------------------------- instruments
def kick(length: float = 0.45) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 45 + 140 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.004) * 0.3
    return np.tanh(1.6 * (body + click))


def clap() -> np.ndarray:
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000)
    e = np.zeros(n)
    for k, d in enumerate((0.0, 0.011, 0.022)):
        i = int(d * SR)
        e[i:] += np.exp(-(t[: n - i]) / (0.012 if k < 2 else 0.11))
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.3
    return (noise * e + tone) * 0.8


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500, 4) * np.exp(-t / (0.09 if open_ else 0.014))


def tick() -> np.ndarray:  # clock tick for the hook
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 2500, 6000) * np.exp(-t / 0.004) + np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.006) * 0.4


def shutter() -> np.ndarray:  # mirror slap + curtain, like a DSLR
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d, g, dec in ((0.0, 1.0, 0.006), (0.055, 0.8, 0.01)):
        i = int(d * SR)
        out[i:] += bp(rng.standard_normal(n - i), 1500, 9000) * np.exp(-t[: n - i] / dec) * g
        out[i:] += np.sin(2 * np.pi * 700 * t[: n - i]) * np.exp(-t[: n - i] / 0.008) * 0.3 * g
    return out


def impact(length: float = 2.5) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 32 + 90 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7)
    crash = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.45) * 0.25
    tail = np.clip((length - t) / (length * 0.4), 0, 1)  # fade out: no click where the sample ends
    return (np.tanh(2.0 * boom) + crash) * tail


def riser(length: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    x = t / length
    noise = rng.standard_normal(n)
    out = svf(noise, 300 * (25**x), "band", 2.0) * 0.6
    tone = np.sin(2 * np.pi * np.cumsum(120 * (8 ** x)) / SR) * 0.25
    return (out * 0.8 + tone) * x**2


def reverse_cymbal(length: float = 1.2) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    return (hp(rng.standard_normal(n), 4000) * np.exp(-t / 0.5))[::-1] * 0.5


def whoosh(length: float = 0.5) -> np.ndarray:
    n = int(length * SR)
    x = np.linspace(0, 1, n)
    shape = np.sin(np.pi * x) ** 2
    return bp(rng.standard_normal(n), 400, 4000) * shape * 0.6


def pluck(m: float, length: float = 0.28) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi(m)
    x = saw(f, n) * 0.6 + saw(f * 1.006, n, 0.3) * 0.4
    cutoff = 600 + 5000 * np.exp(-t / 0.06)
    # time-varying LP approximated by blending two filtered copies
    a, b = lp(x, 900), lp(x, 6000)
    w = (cutoff - 600) / 5000
    return (a * (1 - w) + b * w) * env(n, 0.002, 0.11)


def lead(m: float, length: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi(m) * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.25, 0, 1))  # vibrato
    x = sum(saw(f * d, n, k * 0.17) for k, d in enumerate((1.0, 1.007, 0.993, 2.0)))
    x = lp(x / 4, 4200)
    e = np.clip(t / 0.01, 0, 1) * np.clip((length - t) / 0.06, 0, 1)
    return x * e


def pad(notes: list[float], length: float, cutoff: float = 2200) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in notes:
        for k, d in enumerate((0.994, 1.0, 1.006)):
            x += saw(midi(m) * d, n, k * 0.31)
    x = lp(x / (3 * len(notes)), cutoff)
    e = np.clip(t / 0.35, 0, 1) * np.clip((length - t) / 0.3, 0, 1)
    return x * e


def bass_note(m: float, length: float) -> np.ndarray:
    n = int(length * SR)
    t = np.arange(n) / SR
    f = midi(m)
    x = np.sin(2 * np.pi * f * t) * 0.8 + lp(saw(f, n), 500) * 0.5
    e = np.clip(t / 0.005, 0, 1) * np.clip((length - t) / 0.02, 0, 1)
    return np.tanh(1.5 * x) * e


def reverb(x: np.ndarray, seconds: float = 1.8, mix: float = 0.25) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / (seconds / 5))
    ir = lp(ir, 6000)
    ir /= np.sqrt(np.sum(ir**2))
    wet = fftconvolve(x, ir)[: len(x)]
    return x * (1 - mix) + wet * mix


def delay(x: np.ndarray, time: float, fb: float = 0.35, mix: float = 0.3) -> np.ndarray:
    d = int(time * SR)
    out = x.copy()
    tap = x.copy()
    for _ in range(5):
        tap = np.concatenate([np.zeros(d), tap[:-d]]) * fb
        out += tap * mix / fb * fb
    return out


# ---------------------------------------------------------------- arrangement
# D Hijaz: D Eb F# G A Bb C  (midi: D3=50)
HIJAZ = [0, 1, 4, 5, 7, 8, 10]
ROOT = 50


def deg(d: int, octave: int = 0) -> int:
    return ROOT + 12 * (octave + d // 7) + HIJAZ[d % 7]


# chord roots per bar (in scale degrees) for bars 1..15: i  i  bVI  VII  i ...
PROG = [0, 0, 5, 6]  # D, D, Bb, C


def build(include_music: bool = True) -> np.ndarray:
    drums, bass, music, fx = silence(), silence(), silence(), silence()
    side = np.ones(N)  # sidechain gain curve

    K, C, H, HO = kick(), clap(), hat(), hat(True)

    def duck(at: float) -> None:
        i = int(at * SR)
        n = int(0.22 * SR)
        j = min(N, i + n)
        curve = 1 - 0.75 * np.exp(-np.arange(j - i) / SR / 0.06)
        side[i:j] = np.minimum(side[i:j], curve)

    # ---- hook (bar 0): ticking, drone, heartbeat
    for b in range(8):
        add(fx, tick(), b * BEAT / 2, 0.35 if b % 2 == 0 else 0.2)
    add(music, pad([deg(0, -1), deg(4, -1)], BAR, 600), 0.0, 0.6)
    add(drums, kick(0.3), t_of(0, 2), 0.5)
    add(drums, kick(0.3), t_of(0, 2.4), 0.35)
    add(fx, reverse_cymbal(0.9), t_of(1) - 0.9, 0.8)
    add(fx, shutter(), t_of(1) - 0.12, 1.3)
    add(fx, impact(), t_of(1), 0.9)

    # ---- drums
    for bar in range(1, 16):
        if bar in (8, 9):
            continue
        for beat in range(4):
            at = t_of(bar, beat)
            if bar == 15 and beat >= 2:
                continue  # strip back for the loop
            g = 1.0 if bar >= 3 else 0.8
            add(drums, K, at, g)
            duck(at)
            if bar >= 3:
                add(drums, HO, at + BEAT / 2, 0.22)
                for s in (0.25, 0.75):
                    add(drums, H, at + s * BEAT, 0.12)
            if bar >= 3 and beat in (1, 3):
                add(drums, C, at, 0.55)
        if bar >= 10:  # extra energy in the drop: 16th hats
            for s in range(16):
                add(drums, H, t_of(bar) + s * BEAT / 4, 0.07)

    # filter sweep on bars 1-2 (reveal): low-pass the drums opening up
    a, b = int(t_of(1) * SR), int(t_of(3) * SR)
    seg = drums[a:b].copy()
    drums[a:b] = svf(seg, 300 * (25 ** np.linspace(0, 1, len(seg)) ** 2), "low", 0.9)

    # ---- break (bars 8-9): snare roll accelerating + riser
    roll_start = t_of(9)
    steps = [0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25] + [0.125] * 8
    at = roll_start
    for k, s in enumerate(steps):
        if at >= t_of(10):
            break
        add(drums, C, at, 0.2 + 0.5 * k / len(steps))
        at += s * BEAT
    add(fx, riser(2 * BAR), t_of(8), 0.7)
    add(fx, reverse_cymbal(1.2), t_of(10) - 1.2, 0.9)
    add(fx, impact(3.0), t_of(10), 1.0)

    # ---- transition whooshes on section changes
    for bar in (3, 12, 14):
        add(fx, whoosh(0.45), t_of(bar) - 0.3, 0.6)
    add(fx, shutter(), t_of(14) - 0.1, 0.9)

    if include_music:
        # ---- bass: offbeat 8ths in the groove sections, root of the progression
        for bar in range(1, 16):
            if bar in (8, 9) or bar == 0:
                continue
            root = deg(PROG[bar % 4], -2)
            for e in range(8):
                if bar == 15 and e >= 4:
                    break
                at = t_of(bar) + e * BEAT / 2
                if bar <= 2 and e % 2 == 0:
                    continue  # only offbeats during the reveal
                note = root + (12 if (bar >= 10 and e % 4 == 3) else 0)
                add(bass, bass_note(note, BEAT / 2 * 0.9), at, 0.55)

        # ---- Hijaz arpeggio (montage + drop)
        pattern = [0, 2, 4, 7, 4, 2, 1, 2]  # degrees, gives the augmented 2nd colour (Eb -> F#)
        arp = silence()
        for bar in list(range(3, 8)) + list(range(10, 15)):
            base = PROG[bar % 4]
            for s in range(16):
                d = base + pattern[s % 8]
                add(arp, pluck(deg(d, 1)), t_of(bar) + s * BEAT / 4, 0.18 if bar < 10 else 0.14)
        music += delay(arp, BEAT * 0.75, 0.4, 0.35)

        # ---- pads: break chords and the drop under the lead
        chords = {0: [0, 2, 4], 5: [5, 7, 9], 6: [6, 8, 10]}
        for bar in (8, 9):
            r = PROG[bar % 4]
            add(music, pad([deg(x) for x in chords.get(r, [r, r + 2, r + 4])], BAR, 1500 + 2000 * (bar - 8)), t_of(bar), 1.0)
        for bar in range(10, 15):
            r = PROG[bar % 4]
            add(music, pad([deg(x) for x in chords.get(r, [r, r + 2, r + 4])], BAR, 2600), t_of(bar), 0.3)

        # ---- lead melody in the drop (two-bar phrase, played twice + answer)
        phrase = [  # (degree, octave, start beat, length beats)
            (7, 1, 0, 1.5), (8, 1, 1.5, 0.5), (7, 1, 2, 0.5), (6, 1, 2.5, 0.5), (5, 1, 3, 1),
            (4, 1, 4, 1.5), (5, 1, 5.5, 0.5), (4, 1, 6, 0.5), (2, 1, 6.5, 0.5), (1, 1, 7, 0.5), (2, 1, 7.5, 0.5),
        ]
        answer = [(0, 2, 0, 1), (8, 1, 1, 0.5), (7, 1, 1.5, 0.5), (4, 1, 2, 1), (5, 1, 3, 0.5), (4, 1, 3.5, 0.5),
                  (2, 1, 4, 1), (1, 1, 5, 1), (0, 1, 6, 2)]
        ld = silence()
        for start_bar, ph in ((10, phrase), (12, answer), (14, phrase[:5])):
            for d, o, sb, lb in ph:
                add(ld, lead(deg(d, o), lb * BEAT * 0.95), t_of(start_bar) + sb * BEAT, 0.22)
        music += reverb(delay(ld, BEAT * 0.5, 0.3, 0.25), 2.2, 0.3)

        # break riser pad + hook-to-loop drone at the very end so it loops into bar 0
        add(music, pad([deg(0, -1), deg(4, -1)], BAR * 0.5, 600), t_of(15, 2), 0.6)

    mix = reverb(drums, 0.9, 0.08) * 0.9 + bass * side * 0.9 + music * side**0.5 * 0.8 + reverb(fx, 1.6, 0.2)
    mix = hp(mix, 28)
    # gentle master: soft clip + normalise to -1 dBFS
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    mix *= 10 ** (-1 / 20) / max(1e-9, np.max(np.abs(mix)))
    # short fades so the loop has no click
    f = int(0.01 * SR)
    mix[:f] *= np.linspace(0, 1, f)
    mix[-f:] *= np.linspace(1, 0, f)
    return mix


def write(path: str, mono: np.ndarray) -> None:
    # light stereo width: a few ms of delay on the right channel for everything above the bass
    width = np.concatenate([np.zeros(int(0.006 * SR)), hp(mono, 300)[: -int(0.006 * SR)]])
    left = mono
    right = lp(mono, 300) + width
    stereo = np.stack([left, right], axis=1)
    stereo /= max(1.0, np.max(np.abs(stereo)) / 0.89)
    data = (stereo * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "music.wav"
    write(out, build(include_music="--no-music" not in sys.argv))
    print(f"{out}: {DUR:.2f}s, {BPM} BPM, {BARS} bars")
