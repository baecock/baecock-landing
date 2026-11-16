from PIL import Image

HOLD_MS = 1500
FADE_MS = 45
FADE_STEPS = 6
SCALE = 400 / 480  # 4cutmoa.cloud 히어로 목업(400x820)과 동일한 폭
COLORS = 48

def build(frames_paths, out_path):
    frames = [Image.open(p).convert("RGB") for p in frames_paths]
    w, h = frames[0].size
    new_size = (round(w * SCALE), round(h * SCALE))
    frames = [f.resize(new_size, Image.LANCZOS) for f in frames]

    n = len(frames)
    sequence = []
    durations = []
    for i in range(n):
        cur = frames[i]
        nxt = frames[(i + 1) % n]
        sequence.append(cur)
        durations.append(HOLD_MS)
        for step in range(1, FADE_STEPS + 1):
            alpha = step / (FADE_STEPS + 1)
            sequence.append(Image.blend(cur, nxt, alpha))
            durations.append(FADE_MS)

    palette_source = sequence[0].quantize(colors=COLORS, method=Image.MEDIANCUT)
    quantized = [f.quantize(palette=palette_source, dither=Image.NONE) for f in sequence]

    quantized[0].save(
        out_path,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    print(f"wrote {out_path}: {len(quantized)} frames, size={new_size}")

if __name__ == "__main__":
    build(["member.png", "dues.png", "match.png"], "club-preview.gif")
    build(["health.png", "personal-record.png", "titles.png"], "personal-preview.gif")
