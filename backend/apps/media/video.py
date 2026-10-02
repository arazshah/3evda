"""Video handling with ffmpeg: strip metadata without re-encoding and grab a poster frame."""

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

FFMPEG_TIMEOUT = 600


class VideoError(Exception):
    pass


@dataclass(frozen=True)
class VideoResult:
    data: bytes
    format: str
    width: int
    height: int
    duration: float
    poster_jpeg: bytes


def _run(args: list[str]) -> subprocess.CompletedProcess[bytes]:
    try:
        return subprocess.run(args, capture_output=True, check=True, timeout=FFMPEG_TIMEOUT)  # noqa: S603
    except subprocess.CalledProcessError as exc:
        raise VideoError(exc.stderr.decode(errors="replace")[-300:]) from exc
    except subprocess.TimeoutExpired as exc:
        raise VideoError("ffmpeg timed out") from exc


def process_video(data: bytes, fmt: str) -> VideoResult:
    with tempfile.TemporaryDirectory(prefix="media-") as tmp:
        src = Path(tmp) / f"in.{fmt}"
        src.write_bytes(data)
        probe = json.loads(
            _run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(src)]).stdout
        )
        video = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), None)
        if video is None:
            raise VideoError("no video stream")
        duration = float(probe.get("format", {}).get("duration") or video.get("duration") or 0)

        out = Path(tmp) / f"out.{fmt}"
        container_flags = ["-movflags", "+faststart"] if fmt == "mp4" else []
        _run([
            "ffmpeg", "-v", "error", "-y", "-i", str(src),
            "-map", "0:v", "-map", "0:a?", "-c", "copy",
            "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact",
            *container_flags, str(out),
        ])  # fmt: skip

        poster = Path(tmp) / "poster.jpg"
        at = f"{min(1.0, duration / 2):.2f}"
        _run(["ffmpeg", "-v", "error", "-y", "-ss", at, "-i", str(src), "-frames:v", "1", "-q:v", "2", str(poster)])

        return VideoResult(
            data=out.read_bytes(),
            format=fmt,
            width=int(video["width"]),
            height=int(video["height"]),
            duration=duration,
            poster_jpeg=poster.read_bytes(),
        )
