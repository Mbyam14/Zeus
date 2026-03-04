"""Generate visual mockups of app screens with the updated brand color scheme."""
from PIL import Image, ImageDraw, ImageFont
import os

# Brand colors
PRIMARY = '#FF6B35'
PRIMARY_GRADIENT = '#FF8C42'
SECONDARY = '#2D6A4F'
TEXT_PRIMARY = '#2C3E50'
TEXT_SECONDARY = '#7F8C8D'
TEXT_PLACEHOLDER = '#95A5A6'
TEXT_DISABLED = '#BDC3C7'
BACKGROUND = '#FFF8F0'
CARD_BG = '#FFFFFF'
SUBTLE_BG = '#FFF5F2'
BORDER = '#E1E8ED'
SUCCESS = '#2ECC71'
WARNING = '#F7B32B'
ERROR = '#E74C3C'
WHITE = '#FFFFFF'

PHONE_W, PHONE_H = 390, 844
CORNER = 40

os.makedirs('/home/user/Zeus/mockups', exist_ok=True)

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def draw_rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    x0, y0, x1, y1 = xy
    r = radius
    if fill:
        draw.rectangle([x0+r, y0, x1-r, y1], fill=fill)
        draw.rectangle([x0, y0+r, x1, y1-r], fill=fill)
        draw.pieslice([x0, y0, x0+2*r, y0+2*r], 180, 270, fill=fill)
        draw.pieslice([x1-2*r, y0, x1, y0+2*r], 270, 360, fill=fill)
        draw.pieslice([x0, y1-2*r, x0+2*r, y1], 90, 180, fill=fill)
        draw.pieslice([x1-2*r, y1-2*r, x1, y1], 0, 90, fill=fill)
    if outline:
        draw.arc([x0, y0, x0+2*r, y0+2*r], 180, 270, fill=outline, width=width)
        draw.arc([x1-2*r, y0, x1, y0+2*r], 270, 360, fill=outline, width=width)
        draw.arc([x0, y1-2*r, x0+2*r, y1], 90, 180, fill=outline, width=width)
        draw.arc([x1-2*r, y1-2*r, x1, y1], 0, 90, fill=outline, width=width)
        draw.line([x0+r, y0, x1-r, y0], fill=outline, width=width)
        draw.line([x0+r, y1, x1-r, y1], fill=outline, width=width)
        draw.line([x0, y0+r, x0, y1-r], fill=outline, width=width)
        draw.line([x1, y0+r, x1, y1-r], fill=outline, width=width)

def new_phone():
    img = Image.new('RGB', (PHONE_W, PHONE_H), hex_to_rgb(BACKGROUND))
    draw = ImageDraw.Draw(img)
    return img, draw

def draw_status_bar(draw, y=0):
    draw.text((20, y+8), "9:41", fill=hex_to_rgb(TEXT_PRIMARY), font=None)
    # Battery icon area
    draw.rectangle([PHONE_W-60, y+10, PHONE_W-20, y+22], outline=hex_to_rgb(TEXT_PRIMARY), width=1)
    draw.rectangle([PHONE_W-58, y+12, PHONE_W-30, y+20], fill=hex_to_rgb(SUCCESS))

def draw_tab_bar(draw, active=0):
    y = PHONE_H - 85
    draw.rectangle([0, y, PHONE_W, PHONE_H], fill=hex_to_rgb(WHITE))
    draw.line([0, y, PHONE_W, y], fill=hex_to_rgb(BORDER), width=1)
    tabs = ['Home', 'Plan', 'Create', 'Pantry', 'Profile']
    tab_w = PHONE_W // 5
    for i, tab in enumerate(tabs):
        cx = tab_w * i + tab_w // 2
        color = hex_to_rgb(PRIMARY) if i == active else hex_to_rgb(TEXT_SECONDARY)
        # Icon placeholder circle
        draw.ellipse([cx-12, y+12, cx+12, y+36], outline=color, width=2)
        draw.text((cx-15, y+42), tab, fill=color)

def draw_button(draw, xy, text, bg=PRIMARY, text_color=WHITE):
    draw_rounded_rect(draw, xy, 12, fill=hex_to_rgb(bg))
    x0, y0, x1, y1 = xy
    cx = (x0 + x1) // 2 - len(text) * 3
    cy = (y0 + y1) // 2 - 6
    draw.text((cx, cy), text, fill=hex_to_rgb(text_color))

def draw_card(draw, xy, outline_color=BORDER):
    draw_rounded_rect(draw, xy, 16, fill=hex_to_rgb(CARD_BG), outline=hex_to_rgb(outline_color), width=1)


# ============================================================
# 1. LOGIN SCREEN
# ============================================================
def generate_login():
    img, draw = new_phone()
    draw_status_bar(draw)

    # Logo area
    draw.ellipse([PHONE_W//2-40, 80, PHONE_W//2+40, 160], fill=hex_to_rgb(PRIMARY))
    draw.text((PHONE_W//2-20, 108), "Zeus", fill=hex_to_rgb(WHITE))
    draw.text((PHONE_W//2-55, 175), "Discover amazing recipes", fill=hex_to_rgb(TEXT_SECONDARY))

    # Email input
    y = 230
    draw_rounded_rect(draw, [30, y, PHONE_W-30, y+50], 12, fill=hex_to_rgb(WHITE), outline=hex_to_rgb(BORDER), width=1)
    draw.text((50, y+16), "Email address", fill=hex_to_rgb(TEXT_PLACEHOLDER))

    # Password input
    y = 300
    draw_rounded_rect(draw, [30, y, PHONE_W-30, y+50], 12, fill=hex_to_rgb(WHITE), outline=hex_to_rgb(BORDER), width=1)
    draw.text((50, y+16), "Password", fill=hex_to_rgb(TEXT_PLACEHOLDER))

    # Sign In button
    draw_button(draw, [30, 380, PHONE_W-30, 430], "Sign In", PRIMARY)

    # OR divider
    draw.line([30, 465, PHONE_W//2-30, 465], fill=hex_to_rgb(BORDER), width=1)
    draw.text((PHONE_W//2-10, 458), "OR", fill=hex_to_rgb(TEXT_SECONDARY))
    draw.line([PHONE_W//2+30, 465, PHONE_W-30, 465], fill=hex_to_rgb(BORDER), width=1)

    # Sign Up button (secondary/green)
    draw_rounded_rect(draw, [30, 495, PHONE_W-30, 545], 12, fill=None, outline=hex_to_rgb(SECONDARY), width=2)
    draw.text((PHONE_W//2-35, 512), "Sign Up", fill=hex_to_rgb(SECONDARY))

    # Color palette legend
    y = 620
    draw.text((30, y), "Updated Brand Palette:", fill=hex_to_rgb(TEXT_PRIMARY))
    swatches = [
        (PRIMARY, "Primary"),
        (SECONDARY, "Secondary"),
        (BACKGROUND, "Background"),
        (TEXT_PRIMARY, "Text"),
    ]
    for i, (color, label) in enumerate(swatches):
        sx = 30 + i * 88
        draw.rectangle([sx, y+25, sx+30, y+55], fill=hex_to_rgb(color), outline=hex_to_rgb(TEXT_PRIMARY), width=1)
        draw.text((sx, y+60), label, fill=hex_to_rgb(TEXT_SECONDARY))

    img.save('/home/user/Zeus/mockups/01_login_screen.png')
    print("Generated login screen")


# ============================================================
# 2. FEED / HOME SCREEN
# ============================================================
def generate_feed():
    img, draw = new_phone()
    draw_status_bar(draw)

    # Header
    draw.text((20, 50), "Discover", fill=hex_to_rgb(TEXT_PRIMARY))
    draw.text((20, 68), "What's Cooking Today?", fill=hex_to_rgb(PRIMARY))

    # Recipe Card (main card with image area)
    card_top = 100
    card_bottom = 580
    draw_rounded_rect(draw, [20, card_top, PHONE_W-20, card_bottom], 20, fill=hex_to_rgb(CARD_BG))

    # Image placeholder (dark overlay area)
    draw_rounded_rect(draw, [20, card_top, PHONE_W-20, card_top+280], 20, fill=(60, 60, 60))
    # Fake bottom corners over the rounded image
    draw.rectangle([20, card_top+260, PHONE_W-20, card_top+280], fill=(60, 60, 60))

    # Text on image
    draw.text((40, card_top+180), "Tuscan Chicken Pasta", fill=hex_to_rgb(WHITE))
    draw.text((40, card_top+200), "Creamy Italian comfort food", fill=hex_to_rgb(BACKGROUND))
    # Meta
    draw.text((40, card_top+225), "30 min  |  4 servings", fill=hex_to_rgb(BACKGROUND))

    # Difficulty badge
    draw_rounded_rect(draw, [40, card_top+250, 100, card_top+270], 10, fill=hex_to_rgb(SUCCESS))
    draw.text((52, card_top+254), "Easy", fill=hex_to_rgb(WHITE))

    # AI badge (deep green)
    draw_rounded_rect(draw, [110, card_top+250, 190, card_top+270], 10, fill=hex_to_rgb(SECONDARY))
    draw.text((118, card_top+254), "AI Made", fill=hex_to_rgb(WHITE))

    # Description below image
    draw.text((40, card_top+300), "A delicious creamy pasta with sun-dried", fill=hex_to_rgb(TEXT_PRIMARY))
    draw.text((40, card_top+318), "tomatoes, spinach, and tender chicken.", fill=hex_to_rgb(TEXT_PRIMARY))

    # Tags
    tags = ["Italian", "Pasta", "Quick", "High-Protein"]
    tx = 40
    for tag in tags:
        tw = len(tag) * 7 + 20
        draw_rounded_rect(draw, [tx, card_top+350, tx+tw, card_top+375], 12, fill=hex_to_rgb(BACKGROUND))
        draw.text((tx+10, card_top+356), tag, fill=hex_to_rgb(TEXT_SECONDARY))
        tx += tw + 8

    # Action buttons (skip / like / save)
    btn_y = 610
    # Skip (red circle)
    draw.ellipse([PHONE_W//2-120, btn_y, PHONE_W//2-60, btn_y+60], outline=hex_to_rgb(ERROR), width=3)
    draw.text((PHONE_W//2-100, btn_y+22), "X", fill=hex_to_rgb(ERROR))
    # Like (green circle)
    draw.ellipse([PHONE_W//2-25, btn_y-10, PHONE_W//2+45, btn_y+60], outline=hex_to_rgb(SUCCESS), width=3)
    draw.text((PHONE_W//2-2, btn_y+16), "<3", fill=hex_to_rgb(SUCCESS))
    # Save (orange circle)
    draw.ellipse([PHONE_W//2+70, btn_y, PHONE_W//2+130, btn_y+60], outline=hex_to_rgb(WARNING), width=3)
    draw.text((PHONE_W//2+88, btn_y+22), "*", fill=hex_to_rgb(WARNING))

    draw_tab_bar(draw, active=0)
    img.save('/home/user/Zeus/mockups/02_feed_screen.png')
    print("Generated feed screen")


# ============================================================
# 3. MEAL PLAN SCREEN
# ============================================================
def generate_meal_plan():
    img, draw = new_phone()
    draw_status_bar(draw)

    # Header
    draw.text((20, 50), "Meal Plan", fill=hex_to_rgb(TEXT_PRIMARY))

    # Generate button (primary)
    draw_button(draw, [20, 80, 200, 115], "Generate Plan", PRIMARY)

    # Day tabs
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i, day in enumerate(days):
        dx = 12 + i * 54
        is_active = i == 0
        bg = PRIMARY if is_active else CARD_BG
        tc = WHITE if is_active else TEXT_SECONDARY
        draw_rounded_rect(draw, [dx, 130, dx+48, 162], 10, fill=hex_to_rgb(bg), outline=hex_to_rgb(BORDER) if not is_active else None)
        draw.text((dx+10, 140), day, fill=hex_to_rgb(tc))

    # Meal slots
    meals = [
        ("Breakfast", "Greek Yogurt Parfait", "15 min", SUCCESS),
        ("Lunch", "Mediterranean Bowl", "25 min", WARNING),
        ("Dinner", "Tuscan Chicken Pasta", "30 min", ERROR),
        ("Snack", "Trail Mix & Apple", "5 min", SUCCESS),
    ]
    y = 185
    for meal_type, name, time, diff_color in meals:
        draw_card(draw, [20, y, PHONE_W-20, y+120])
        draw.text((40, y+12), meal_type, fill=hex_to_rgb(TEXT_SECONDARY))
        draw.text((40, y+32), name, fill=hex_to_rgb(TEXT_PRIMARY))
        draw.text((40, y+55), time, fill=hex_to_rgb(TEXT_SECONDARY))
        # Difficulty dot
        draw.ellipse([40, y+78, 52, y+90], fill=hex_to_rgb(diff_color))
        draw.text((58, y+78), "Easy" if diff_color == SUCCESS else ("Medium" if diff_color == WARNING else "Hard"), fill=hex_to_rgb(diff_color))
        # Thumbnail placeholder
        draw_rounded_rect(draw, [PHONE_W-100, y+15, PHONE_W-40, y+90], 10, fill=hex_to_rgb(SUBTLE_BG))
        y += 135

    # Grocery list button (secondary green)
    draw_button(draw, [20, y+10, PHONE_W-20, y+55], "View Grocery List", SECONDARY)

    draw_tab_bar(draw, active=1)
    img.save('/home/user/Zeus/mockups/03_meal_plan_screen.png')
    print("Generated meal plan screen")


# ============================================================
# 4. PANTRY SCREEN
# ============================================================
def generate_pantry():
    img, draw = new_phone()
    draw_status_bar(draw)

    # Header
    draw.text((20, 50), "My Pantry", fill=hex_to_rgb(TEXT_PRIMARY))
    draw_button(draw, [PHONE_W-130, 45, PHONE_W-20, 75], "Add Item", PRIMARY)

    # Search bar
    draw_rounded_rect(draw, [20, 95, PHONE_W-20, 135], 12, fill=hex_to_rgb(WHITE), outline=hex_to_rgb(BORDER), width=1)
    draw.text((40, 108), "Search pantry items...", fill=hex_to_rgb(TEXT_PLACEHOLDER))

    # Category pills
    cats = ["All", "Produce", "Dairy", "Meat", "Grains"]
    cx = 20
    for i, cat in enumerate(cats):
        cw = len(cat) * 7 + 24
        is_active = i == 0
        bg = PRIMARY if is_active else CARD_BG
        tc = WHITE if is_active else TEXT_SECONDARY
        draw_rounded_rect(draw, [cx, 150, cx+cw, 178], 14, fill=hex_to_rgb(bg), outline=hex_to_rgb(BORDER) if not is_active else None)
        draw.text((cx+12, 158), cat, fill=hex_to_rgb(tc))
        cx += cw + 8

    # Pantry items
    items = [
        ("Chicken Breast", "2 lbs", "Expires in 3 days", WARNING),
        ("Cherry Tomatoes", "1 pint", "Expires in 5 days", SUCCESS),
        ("Parmesan Cheese", "8 oz", "Expires tomorrow", ERROR),
        ("Penne Pasta", "1 lb", "Expires in 6 months", SUCCESS),
        ("Fresh Spinach", "6 oz", "Expired 1 day ago", ERROR),
        ("Olive Oil", "16 oz", "No expiry", SUCCESS),
        ("Heavy Cream", "1 cup", "Expires in 4 days", WARNING),
    ]
    y = 200
    for name, qty, exp, exp_color in items:
        draw_card(draw, [20, y, PHONE_W-20, y+70])
        draw.text((40, y+12), name, fill=hex_to_rgb(TEXT_PRIMARY))
        draw.text((40, y+32), qty, fill=hex_to_rgb(TEXT_SECONDARY))
        draw.text((PHONE_W-200, y+12), exp, fill=hex_to_rgb(exp_color))
        # Quantity circle
        draw_rounded_rect(draw, [PHONE_W-60, y+20, PHONE_W-35, y+45], 6, fill=hex_to_rgb(SUBTLE_BG))
        y += 82

    draw_tab_bar(draw, active=3)
    img.save('/home/user/Zeus/mockups/04_pantry_screen.png')
    print("Generated pantry screen")


# ============================================================
# 5. PROFILE SCREEN
# ============================================================
def generate_profile():
    img, draw = new_phone()
    draw_status_bar(draw)

    # Header area
    draw.text((20, 50), "Profile", fill=hex_to_rgb(TEXT_PRIMARY))

    # Avatar
    draw.ellipse([PHONE_W//2-45, 90, PHONE_W//2+45, 180], fill=hex_to_rgb(PRIMARY))
    draw.text((PHONE_W//2-10, 125), "JD", fill=hex_to_rgb(WHITE))

    # Name
    draw.text((PHONE_W//2-35, 195), "Jane Doe", fill=hex_to_rgb(TEXT_PRIMARY))
    draw.text((PHONE_W//2-45, 215), "Food enthusiast", fill=hex_to_rgb(TEXT_SECONDARY))

    # Stats row
    stats = [("12", "Recipes"), ("45", "Liked"), ("8", "Saved")]
    for i, (num, label) in enumerate(stats):
        sx = 40 + i * 115
        draw_card(draw, [sx, 250, sx+95, 310])
        draw.text((sx+38, 262), num, fill=hex_to_rgb(PRIMARY))
        draw.text((sx+20, 285), label, fill=hex_to_rgb(TEXT_SECONDARY))

    # Menu items
    menu = [
        ("My Recipes", PRIMARY),
        ("Saved Recipes", PRIMARY),
        ("Liked Recipes", PRIMARY),
        ("Edit Preferences", SECONDARY),
        ("Settings", TEXT_SECONDARY),
        ("Log Out", ERROR),
    ]
    y = 335
    for label, color in menu:
        draw_card(draw, [20, y, PHONE_W-20, y+50])
        draw.text((40, y+16), label, fill=hex_to_rgb(color))
        draw.text((PHONE_W-50, y+16), ">", fill=hex_to_rgb(BORDER))
        y += 60

    draw_tab_bar(draw, active=4)
    img.save('/home/user/Zeus/mockups/05_profile_screen.png')
    print("Generated profile screen")


# ============================================================
# 6. CREATE RECIPE SCREEN
# ============================================================
def generate_create():
    img, draw = new_phone()

    # Orange header gradient
    draw.rectangle([0, 0, PHONE_W, 130], fill=hex_to_rgb(PRIMARY))
    # Slightly lighter lower portion for gradient effect
    draw.rectangle([0, 80, PHONE_W, 130], fill=hex_to_rgb(PRIMARY_GRADIENT))
    draw_status_bar(draw, 0)
    draw.text((20, 50), "Create Recipe", fill=hex_to_rgb(WHITE))
    draw.text((20, 70), "Share your culinary creations", fill=hex_to_rgb(SUBTLE_BG))

    # Form area
    y = 150
    # Recipe name
    draw.text((30, y), "Recipe Name", fill=hex_to_rgb(TEXT_PRIMARY))
    draw_rounded_rect(draw, [20, y+20, PHONE_W-20, y+60], 12, fill=hex_to_rgb(WHITE), outline=hex_to_rgb(BORDER), width=1)
    draw.text((35, y+33), "e.g. Grandma's Apple Pie", fill=hex_to_rgb(TEXT_PLACEHOLDER))

    # Description
    y = 250
    draw.text((30, y), "Description", fill=hex_to_rgb(TEXT_PRIMARY))
    draw_rounded_rect(draw, [20, y+20, PHONE_W-20, y+80], 12, fill=hex_to_rgb(WHITE), outline=hex_to_rgb(BORDER), width=1)
    draw.text((35, y+33), "Describe your recipe...", fill=hex_to_rgb(TEXT_PLACEHOLDER))

    # Ingredients section
    y = 370
    draw.text((30, y), "Ingredients", fill=hex_to_rgb(TEXT_PRIMARY))
    ingredients = ["2 cups flour", "1 cup sugar", "3 eggs"]
    for i, ing in enumerate(ingredients):
        iy = y + 25 + i * 45
        draw_rounded_rect(draw, [20, iy, PHONE_W-20, iy+38], 10, fill=hex_to_rgb(WHITE), outline=hex_to_rgb(BORDER), width=1)
        # Number circle
        draw.ellipse([30, iy+6, 55, iy+31], fill=hex_to_rgb(SUBTLE_BG))
        draw.text((38, iy+11), str(i+1), fill=hex_to_rgb(PRIMARY))
        draw.text((65, iy+11), ing, fill=hex_to_rgb(TEXT_PRIMARY))

    # Add ingredient button
    iy = y + 25 + 3 * 45
    draw_rounded_rect(draw, [20, iy, PHONE_W-20, iy+38], 10, fill=None, outline=hex_to_rgb(PRIMARY), width=2)
    draw.text((PHONE_W//2-45, iy+11), "+ Add More", fill=hex_to_rgb(PRIMARY))

    # OR AI generate
    iy += 60
    draw.line([20, iy, PHONE_W//2-20, iy], fill=hex_to_rgb(BORDER), width=1)
    draw.text((PHONE_W//2-10, iy-6), "OR", fill=hex_to_rgb(TEXT_SECONDARY))
    draw.line([PHONE_W//2+20, iy, PHONE_W-20, iy], fill=hex_to_rgb(BORDER), width=1)

    draw_button(draw, [20, iy+15, PHONE_W-20, iy+60], "Generate with AI", SECONDARY)

    # Submit button
    draw_button(draw, [20, PHONE_H-130, PHONE_W-20, PHONE_H-90], "Create Recipe", PRIMARY)

    draw_tab_bar(draw, active=2)
    img.save('/home/user/Zeus/mockups/06_create_screen.png')
    print("Generated create screen")


if __name__ == '__main__':
    generate_login()
    generate_feed()
    generate_meal_plan()
    generate_pantry()
    generate_profile()
    generate_create()
    print("\nAll mockups saved to /home/user/Zeus/mockups/")
