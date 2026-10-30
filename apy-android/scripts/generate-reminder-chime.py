"""Generate APY's original 0.85s three-note chime; no third-party audio assets."""
import math
from pathlib import Path
import struct
import wave

output = Path(__file__).resolve().parents[1] / 'android/app/src/main/res/raw/apy_reminder.wav'
output.parent.mkdir(parents=True, exist_ok=True)
rate = 22050
frames = []
for index in range(int(rate * 0.85)):
    time = index / rate
    sample = 0.0
    for start, frequency in [(0, 659.255), (0.19, 830.609), (0.38, 987.767)]:
        elapsed = time - start
        if 0 <= elapsed < 0.45:
            envelope = min(elapsed / 0.012, 1) * math.exp(-8 * elapsed)
            envelope *= 1 - min(max((elapsed - 0.40) / 0.05, 0), 1)
            sample += 0.23 * envelope * (math.sin(2 * math.pi * frequency * elapsed)
                                        + 0.18 * math.sin(4 * math.pi * frequency * elapsed))
    frames.append(struct.pack('<h', int(max(-1, min(1, sample)) * 32767)))
with wave.open(str(output), 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(rate)
    audio.writeframes(b''.join(frames))
