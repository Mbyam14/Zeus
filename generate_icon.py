from PIL import Image, ImageDraw
import math
import os

def draw_rounded_rect(draw, xy, radius, fill):
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)

def draw_lightning(draw, cx, cy, size, color):
    # Lightning bolt points, centered at cx, cy
    s = size
    points = [
        (cx + s * 0.15,  cy - s * 0.50),  # top right
        (cx - s * 0.05,  cy - s * 0.02),  # middle left notch
        (cx + s * 0.18,  cy - s * 0.02),  # middle right notch
        (cx - s * 0.15,  cy + s * 0.50),  # bottom left
        (cx + s * 0.05,  cy + s * 0.02),  # middle right notch
        (cx - s * 0.18,  cy + s * 0.02),  # middle left notch
    ]
    draw.polygon(points, fill=color)

def generate_icon(size, path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background - dark navy
    bg_radius = int(size * 0.22)
    draw_rounded_rect(draw, [0, 0, size, size], bg_radius, '#12101A')

    # Orange card - slightly inset rounded square
    pad = int(size * 0.12)
    card_radius = int(size * 0.16)
    draw_rounded_rect(draw, [pad, pad, size - pad, size - pad], card_radius, '#FF6B35')

    # Inner dark inset for depth
    pad2 = int(size * 0.16)
    card2_radius = int(size * 0.12)
    draw_rounded_rect(draw, [pad2, pad2, size - pad2, size - pad2], card2_radius, '#E55A2B')

    # Lightning bolt - white
    cx = size * 0.5
    cy = size * 0.5
    bolt_size = size * 0.28
    draw_lightning(draw, cx, cy, bolt_size, '#FFFFFF')

    img = img.convert('RGB')
    img.save(path, 'PNG', quality=100)
    print(f'Saved {path} ({size}x{size})')

def generate_splash(size, path):
    img = Image.new('RGBA', (size, size), '#12101A')
    draw = ImageDraw.Draw(img)

    cx = size * 0.5
    cy = size * 0.5
    card_size = int(size * 0.45)

    pad = (size - card_size) // 2
    card_radius = int(card_size * 0.22)
    draw_rounded_rect(draw, [pad, pad, pad + card_size, pad + card_size], card_radius, '#FF6B35')

    pad2 = pad + int(card_size * 0.06)
    card2_size = card_size - int(card_size * 0.12)
    card2_radius = int(card_size * 0.16)
    draw_rounded_rect(draw, [pad2, pad2, pad2 + card2_size, pad2 + card2_size], card2_radius, '#E55A2B')

    bolt_size = card_size * 0.28
    draw_lightning(draw, cx, cy, bolt_size, '#FFFFFF')

    img = img.convert('RGB')
    img.save(path, 'PNG', quality=100)
    print(f'Saved {path} ({size}x{size})')

assets_dir = os.path.join(os.path.dirname(__file__), 'zeus-app', 'assets')

generate_icon(1024, os.path.join(assets_dir, 'icon.png'))
generate_icon(1024, os.path.join(assets_dir, 'adaptive-icon.png'))
generate_splash(512, os.path.join(assets_dir, 'splash-icon.png'))
print('Done.')
