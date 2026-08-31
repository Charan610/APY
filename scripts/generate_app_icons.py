import os
import math
from PIL import Image, ImageDraw, ImageFilter

def create_graduation_cap_icon(size=512):
    # Render at 4x resolution for anti-aliasing
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center = canvas_size / 2
    radius = (canvas_size * 0.44)

    # 1. Background rounded circle / squircle
    # Draw soft shadow
    shadow_offset = int(12 * scale)
    draw.ellipse(
        [center - radius, center - radius + shadow_offset, center + radius, center + radius + shadow_offset],
        fill=(0, 0, 0, 120)
    )

    # Gradient background
    for r in range(int(radius), 0, -1):
        factor = r / radius
        # Dark collegiate blue-black to deep obsidian
        r_col = int(11 * (1 - factor) + 24 * factor)
        g_col = int(15 * (1 - factor) + 33 * factor)
        b_col = int(28 * (1 - factor) + 54 * factor)
        draw.ellipse([center - r, center - r, center + r, center + r], fill=(r_col, g_col, b_col, 255))

    # Outer Gold Ring
    ring_width = int(4 * scale)
    draw.ellipse(
        [center - radius, center - radius, center + radius, center + radius],
        outline=(217, 119, 6, 220),
        width=ring_width
    )
    draw.ellipse(
        [center - radius + ring_width, center - radius + ring_width, center + radius - ring_width, center + radius - ring_width],
        outline=(245, 158, 11, 100),
        width=int(2 * scale)
    )

    # 2. Graduation Cap ("Hat") Geometry
    # Skullcap Base (lower head part)
    base_top_y = center + int(20 * scale)
    base_bottom_y = center + int(75 * scale)
    base_left_x = center - int(80 * scale)
    base_right_x = center + int(80 * scale)

    draw.polygon([
        (base_left_x, base_top_y),
        (center - int(65 * scale), base_bottom_y),
        (center + int(65 * scale), base_bottom_y),
        (base_right_x, base_top_y)
    ], fill=(180, 83, 9, 255))

    draw.polygon([
        (base_left_x + int(4 * scale), base_top_y + int(2 * scale)),
        (center - int(60 * scale), base_bottom_y - int(4 * scale)),
        (center + int(60 * scale), base_bottom_y - int(4 * scale)),
        (base_right_x - int(4 * scale), base_top_y + int(2 * scale))
    ], fill=(217, 119, 6, 255))

    # Mortarboard Diamond (Top hat part)
    top_y = center - int(80 * scale)
    bot_y = center + int(35 * scale)
    left_x = center - int(140 * scale)
    right_x = center + int(140 * scale)

    # Diamond Shadow
    draw.polygon([
        (center, top_y + int(8 * scale)),
        (right_x, center - int(22 * scale) + int(8 * scale)),
        (center, bot_y + int(8 * scale)),
        (left_x, center - int(22 * scale) + int(8 * scale))
    ], fill=(0, 0, 0, 100))

    # Diamond Main
    draw.polygon([
        (center, top_y),
        (right_x, center - int(22 * scale)),
        (center, bot_y),
        (left_x, center - int(22 * scale))
    ], fill=(245, 158, 11, 255))

    # Highlight gradient effect on top half
    draw.polygon([
        (center, top_y + int(4 * scale)),
        (right_x - int(8 * scale), center - int(22 * scale)),
        (center, center - int(22 * scale)),
        (left_x + int(8 * scale), center - int(22 * scale))
    ], fill=(251, 191, 36, 240))

    # Diamond border
    draw.polygon([
        (center, top_y),
        (right_x, center - int(22 * scale)),
        (center, bot_y),
        (left_x, center - int(22 * scale))
    ], outline=(254, 240, 138, 255), width=int(3 * scale))

    # Button at center of mortarboard
    btn_r = int(12 * scale)
    draw.ellipse([center - btn_r, center - int(22 * scale) - btn_r, center + btn_r, center - int(22 * scale) + btn_r], fill=(254, 240, 138, 255))

    # Tassel ribbon + hanging bell
    tassel_ribbon = [
        (center, center - int(22 * scale)),
        (center + int(85 * scale), center - int(5 * scale)),
        (center + int(115 * scale), center + int(45 * scale)),
        (center + int(118 * scale), center + int(90 * scale))
    ]
    draw.line(tassel_ribbon, fill=(254, 240, 138, 255), width=int(4 * scale), joint="curve")

    # Tassel brush / fringes
    f_center_x = center + int(118 * scale)
    f_top_y = center + int(85 * scale)
    draw.polygon([
        (f_center_x - int(6 * scale), f_top_y),
        (f_center_x + int(6 * scale), f_top_y),
        (f_center_x + int(12 * scale), f_top_y + int(35 * scale)),
        (f_center_x - int(12 * scale), f_top_y + int(35 * scale))
    ], fill=(253, 224, 71, 255))

    # Downsample with high-quality Lanczos anti-aliasing
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

def create_foreground_icon(size=512):
    # For Android adaptive icons (transparent background, larger emblem)
    scale = 4
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center = canvas_size / 2

    # Skullcap Base
    base_top_y = center + int(15 * scale)
    base_bottom_y = center + int(65 * scale)
    base_left_x = center - int(70 * scale)
    base_right_x = center + int(70 * scale)

    draw.polygon([
        (base_left_x, base_top_y),
        (center - int(55 * scale), base_bottom_y),
        (center + int(55 * scale), base_bottom_y),
        (base_right_x, base_top_y)
    ], fill=(180, 83, 9, 255))

    draw.polygon([
        (base_left_x + int(4 * scale), base_top_y + int(2 * scale)),
        (center - int(50 * scale), base_bottom_y - int(4 * scale)),
        (center + int(50 * scale), base_bottom_y - int(4 * scale)),
        (base_right_x - int(4 * scale), base_top_y + int(2 * scale))
    ], fill=(217, 119, 6, 255))

    # Mortarboard Diamond
    top_y = center - int(75 * scale)
    bot_y = center + int(25 * scale)
    left_x = center - int(125 * scale)
    right_x = center + int(125 * scale)

    draw.polygon([
        (center, top_y + int(6 * scale)),
        (right_x, center - int(25 * scale) + int(6 * scale)),
        (center, bot_y + int(6 * scale)),
        (left_x, center - int(25 * scale) + int(6 * scale))
    ], fill=(0, 0, 0, 80))

    draw.polygon([
        (center, top_y),
        (right_x, center - int(25 * scale)),
        (center, bot_y),
        (left_x, center - int(25 * scale))
    ], fill=(245, 158, 11, 255))

    draw.polygon([
        (center, top_y + int(3 * scale)),
        (right_x - int(6 * scale), center - int(25 * scale)),
        (center, center - int(25 * scale)),
        (left_x + int(6 * scale), center - int(25 * scale))
    ], fill=(251, 191, 36, 240))

    draw.polygon([
        (center, top_y),
        (right_x, center - int(25 * scale)),
        (center, bot_y),
        (left_x, center - int(25 * scale))
    ], outline=(254, 240, 138, 255), width=int(3 * scale))

    btn_r = int(10 * scale)
    draw.ellipse([center - btn_r, center - int(25 * scale) - btn_r, center + btn_r, center - int(25 * scale) + btn_r], fill=(254, 240, 138, 255))

    tassel_ribbon = [
        (center, center - int(25 * scale)),
        (center + int(75 * scale), center - int(10 * scale)),
        (center + int(100 * scale), center + int(35 * scale)),
        (center + int(105 * scale), center + int(75 * scale))
    ]
    draw.line(tassel_ribbon, fill=(254, 240, 138, 255), width=int(4 * scale), joint="curve")

    f_center_x = center + int(105 * scale)
    f_top_y = center + int(72 * scale)
    draw.polygon([
        (f_center_x - int(5 * scale), f_top_y),
        (f_center_x + int(5 * scale), f_top_y),
        (f_center_x + int(10 * scale), f_top_y + int(30 * scale)),
        (f_center_x - int(10 * scale), f_top_y + int(30 * scale))
    ], fill=(253, 224, 71, 255))

    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    res_dir = "/Users/charan/APY/apy-android/android/app/src/main/res"
    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192
    }

    # Generate master 512x512 icons
    master_icon = create_graduation_cap_icon(512)
    master_fg = create_foreground_icon(512)

    master_icon.save("/Users/charan/APY/apy-android/src/assets/icon.png", "PNG")
    master_icon.save("/Users/charan/APY/frontend/src/assets/icon.png", "PNG")

    for folder, dim in densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        # Standard launcher icon
        icon = master_icon.resize((dim, dim), Image.Resampling.LANCZOS)
        icon.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")
        icon.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")
        
        # Adaptive foreground
        fg = master_fg.resize((dim, dim), Image.Resampling.LANCZOS)
        fg.save(os.path.join(folder_path, "ic_launcher_foreground.png"), "PNG")
        print(f"Generated icons for {folder} ({dim}x{dim})")

    print("All Android graduation cap (hat) launcher icons successfully generated!")

if __name__ == "__main__":
    main()
