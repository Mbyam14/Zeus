"""
Ingredient name normalization for USDA matching.

Takes a raw ingredient name as stored in `recipes.ingredients[*].name` and
strips qualifiers/prep instructions so what remains is a clean noun phrase
the USDA matcher can lookup. The matcher only sees the output of this module.

Examples:
  "fresh shrimp, peeled and deveined"        -> "shrimp"
  "extra virgin olive oil"                   -> "olive oil"
  "(16 ounce) package egg noodles"           -> "egg noodles"
  "fresh asparagus, trimmed"                 -> "asparagus"
  "low-fat cottage cheese"                   -> "cottage cheese"
  "salt and pepper to taste"                 -> ""   (skipped)
  "1/4 inch piece fresh ginger root, minced" -> "ginger root"
"""

import re

# ─── Qualifier vocabularies ───────────────────────────────────────────────────

# Adjectives that appear before the actual food noun. Stripped from the front.
# Multi-word entries are checked before single-word entries.
LEADING_QUALIFIERS = [
    # State / freshness
    "extra virgin", "extra-virgin", "virgin", "refined", "unrefined",
    "raw", "fresh", "cooked", "uncooked", "dried", "dry",
    "frozen", "thawed", "defrosted",
    "canned", "jarred", "bottled", "pickled", "fermented",
    "smoked", "cured",
    # Fat / sodium qualifiers
    "low-fat", "low fat", "reduced-fat", "reduced fat",
    "full-fat", "full fat", "fat-free", "nonfat", "non-fat",
    "low-sodium", "low sodium", "reduced-sodium", "reduced sodium",
    "salted", "unsalted", "sweetened", "unsweetened",
    "low-sugar", "low sugar", "sugar-free", "sugar free",
    # Size / quality
    "extra large", "extra-large", "large", "medium", "small",
    "extra small", "extra-small", "jumbo", "mini", "baby",
    # Provenance
    "organic", "free-range", "free range", "grass-fed", "grass fed",
    "wild-caught", "wild caught", "farm-raised", "farm raised",
    "pasture-raised", "pasture raised",
    # Prep state at front
    "ground", "whole", "shredded", "grated", "crushed",
    "sliced", "chopped", "minced", "diced", "cubed",
    "halved", "quartered", "peeled", "unpeeled",
    "toasted", "roasted",
    "hot", "cold", "warm", "room temperature",
    "thinly sliced", "thinly-sliced",
    "finely chopped", "finely-chopped",
    "coarsely chopped", "coarsely-chopped",
    "ripe", "unripe", "skinless", "boneless",
    "boneless skinless", "skinless boneless",
    # Packaging noise (when not stripped by paren removal)
    "package of", "package",
    "can of", "can",
    "jar of", "jar",
    "bottle of", "bottle",
    "container of", "container",
    "stick of", "stick",
    "head of", "head",
    "bunch of", "bunch",
    "clove of", "clove",
    "pinch of", "pinch",
    "dash of", "dash",
    "pound of", "pound",
    "ounce of", "ounce",
    "inch piece of", "inch piece", "inch slice", "inch chunk",
    "piece of", "piece", "slice of", "slice", "chunk of", "chunk",
    "ball of", "ball",
    "knob of", "knob",
    # Leading unit words — these are usually a parse-error artifact where the
    # ingredient JSON has empty quantity/unit and the unit-word leaked into name.
    # Examples seen in the data:
    #   "tablespoons unsalted butter"  -> "unsalted butter"
    #   "cup chopped onion"            -> "chopped onion" -> "onion"
    #   "teaspoon minced garlic"       -> "minced garlic" -> "garlic"
    "tablespoons", "tablespoon", "tbsps", "tbsp", "tbs",
    "teaspoons", "teaspoon", "tsps", "tsp",
    "cups", "cup",
    "pounds", "pound", "lbs", "lb",
    "ounces", "ounce", "ozs", "oz",
    "fluid ounces", "fluid ounce", "fl ounces", "fl ounce", "fl oz",
    "grams", "gram", "kg", "g",
    "milliliters", "milliliter", "ml",
    "liters", "liter", "litres", "litre", "l",
    "pints", "pint", "quarts", "quart", "gallons", "gallon",
    "cloves", "sticks", "heads", "bunches", "stalks", "stalk",
    "sprigs", "sprig", "leaves", "leaf",
    "spears", "spear",
    "slices", "slice",
    "cans", "jars", "bottles", "containers", "packages",
    "pinches", "pinches",
    "halves", "half",
    # Descriptor / size words that leak into name when not stripped earlier
    "thick", "thin", "thinly", "thickly",
    "bone in", "bone-in", "boneless", "skinless",
    "bone in skinless", "bone-in skinless", "boneless skinless",
    "pitted", "seedless", "skinless boneless",
]

# Sort longest-first so multi-word qualifiers match before their sub-words.
LEADING_QUALIFIERS = sorted(set(LEADING_QUALIFIERS), key=lambda s: -len(s))

# Noise phrases stripped from anywhere in the string.
NOISE_PHRASES = [
    "to taste", "or to taste",
    "or as needed", "as needed",
    "or more if needed", "if needed",
    "optional", "if desired",
    "divided", "for garnish", "for serving", "for brushing",
    "for greasing", "for drizzling", "to serve",
    "plus more for", "plus extra for",
    "preferably", "ideally",
]

# Ingredients whose absence/presence is nutritionally negligible. Skip entirely.
NEGLIGIBLE_INGREDIENTS = {
    "water", "ice", "ice cubes", "ice water",
    "salt", "kosher salt", "sea salt", "table salt", "salt to taste",
    "pepper", "black pepper", "white pepper", "ground pepper",
    "ground black pepper", "freshly ground black pepper",
    "salt and pepper", "salt & pepper",
    "salt and ground black pepper",
    "salt and freshly ground black pepper",
    "salt and freshly ground pepper",
    "cooking spray", "non-stick spray", "non-stick cooking spray",
    "non stick cooking spray", "pan spray",
    "freshly ground pepper",
    "crushed red pepper flake", "crushed red pepper flakes", "red pepper flake", "red pepper flakes",
    # Tools / garnishes — not actual ingredients with nutritional value
    "toothpick", "wooden skewer", "skewer", "bamboo skewer", "metal skewer",
    "parchment paper", "aluminum foil", "wax paper",
    "candy cane", "peppermint candy cane",
    "wooden pop stick", "pop stick", "popsicle stick",
    "canning jar", "canning jars with lid and ring", "canning jar with lid and ring",
    "canning jars with lids and ring", "canning jars with lids and rings",
    "paper muffin cup", "muffin cup", "muffin liner", "cupcake liner",
    "ice cube", "cube ice", "cubes ice", "crushed ice",
    "coarse sea salt", "fine sea salt", "flaky sea salt",
}

# Inflection: rough singularize for matching purposes.
PLURAL_RULES = [
    (re.compile(r"ies$"), "y"),
    (re.compile(r"oes$"), "o"),        # tomatoes -> tomato, potatoes -> potato
    (re.compile(r"ches$"), "ch"),
    (re.compile(r"shes$"), "sh"),
    (re.compile(r"sses$"), "ss"),
    # NOTE: no "ves$ -> f" rule — it correctly handles "leaves -> leaf" but
    # breaks "olives -> olif", "cloves -> clof", "knives -> knif". The fuzzy
    # matcher's prefix-tolerant token comparison handles these instead.
    (re.compile(r"s$"), ""),
]

NON_PLURAL_WHITELIST = {
    # Words ending in "s" that aren't plural.
    "molasses", "asparagus", "couscous", "hummus", "swiss",
    "anise", "watercress", "cress", "chives", "greens",
    "oats", "grits", "noodles",   # often referenced plural; leave as-is
}


# ─── Specialty / brand alias map ──────────────────────────────────────────────
# USDA carries common food forms but not every brand / regional / specialty
# name. This dictionary remaps niche ingredient names to the closest USDA
# entry so we don't leave nutrition gaps. Keys are normalizer OUTPUT
# (lowercased, singularized) — they're looked up after all other normalization.
#
# Conservative: only map when the nutritional profile is genuinely close.
# Substitution is a best-effort approximation, not perfection — the goal is
# better-than-NULL macros, not perfect accuracy.

INGREDIENT_ALIASES = {
    # Specialty cheeses → closest USDA cheese
    "parmigiano reggiano":          "parmesan cheese",
    "parmigiano reggiano cheese":   "parmesan cheese",
    "pecorino romano":              "parmesan cheese",
    "pecorino":                     "parmesan cheese",
    "asiago cheese":                "parmesan cheese",
    "manchego":                     "parmesan cheese",
    "manchego cheese":              "parmesan cheese",
    "gruyere":                      "swiss cheese",
    "gruyere cheese":               "swiss cheese",
    "emmental":                     "swiss cheese",
    "fontina":                      "mozzarella cheese",
    "fontina cheese":               "mozzarella cheese",
    "havarti":                      "monterey jack cheese",
    "havarti cheese":               "monterey jack cheese",
    "gouda":                        "edam cheese",
    "gouda cheese":                 "edam cheese",
    "gorgonzola":                   "blue cheese",
    "gorgonzola cheese":            "blue cheese",
    "crumbled gorgonzola cheese":   "blue cheese",
    "stilton":                      "blue cheese",
    "queso fresco":                 "feta cheese",
    "cotija":                       "feta cheese",
    "cotija cheese":                "feta cheese",
    "mascarpone":                   "cream cheese",
    "mascarpone cheese":            "cream cheese",
    "burrata":                      "mozzarella cheese",

    # Specialty meats → closest USDA cut
    "prosciutto":                   "ham cured",
    "pancetta":                     "bacon",
    "guanciale":                    "bacon",
    "speck":                        "ham cured",
    "bresaola":                     "beef dried",
    "capicola":                     "ham cured",
    "salami":                       "salami pork",
    "mortadella":                   "ham cured",
    "filet mignon":                 "beef tenderloin",
    "filet mignon steak":           "beef tenderloin",
    "ribeye":                       "beef ribeye",
    "skirt steak":                  "beef skirt",
    "flank steak":                  "beef flank",
    "hanger steak":                 "beef tenderloin",
    "chuck roast":                  "beef chuck",
    "pork loin chop":               "pork loin",
    "thick slice bacon":            "bacon",
    "applewood smoked bacon":       "bacon",
    "andouille sausage":            "sausage pork",
    "kielbasa":                     "sausage pork",
    "chorizo":                      "sausage pork",
    "bratwurst":                    "sausage pork",

    # Seafood
    "crabmeat":                     "crab cooked",
    "lump crabmeat":                "crab cooked",
    "imitation crab meat":          "crab imitation",
    "clams in shell":               "clams raw",
    "bay scallop":                  "scallops raw",
    "sea scallop":                  "scallops raw",
    "smoked salmon":                "salmon cooked",
    "lox":                          "salmon cooked",

    # Vegetables / produce
    "bok choy":                     "cabbage chinese",
    "napa cabbage":                 "cabbage chinese",
    "shanghai bok choy":            "cabbage chinese",
    "chinese cabbage":              "cabbage chinese",
    "flat leaf parsley":            "parsley",
    "italian parsley":              "parsley",
    "curly parsley":                "parsley",
    "fresh parsley":                "parsley",
    "yukon gold potato":            "potatoes",
    "russet potato":                "potatoes",
    "red potato":                   "potatoes",
    "fingerling potato":            "potatoes",
    "sweet potato":                 "sweet potato",
    "tomatillo":                    "tomato green",
    "kohlrabi":                     "turnip raw",
    "celeriac":                     "celery raw",
    "fennel bulb":                  "fennel raw",
    "rutabaga":                     "turnip raw",

    # Pasta / breads
    "angel hair pasta":             "pasta dry",
    "capellini":                    "pasta dry",
    "linguine":                     "pasta dry",
    "fettuccine":                   "pasta dry",
    "tagliatelle":                  "pasta dry",
    "pappardelle":                  "pasta dry",
    "rigatoni":                     "pasta dry",
    "penne":                        "pasta dry",
    "ziti":                         "pasta dry",
    "orecchiette":                  "pasta dry",
    "farfalle":                     "pasta dry",
    "rotini":                       "pasta dry",
    "cavatappi":                    "pasta dry",
    "bucatini":                     "pasta dry",
    "fusilli":                      "pasta dry",
    "unbaked tart shell":           "pie crust",
    "tart shell":                   "pie crust",
    "pie shell":                    "pie crust",
    "graham cracker crust":         "pie crust",
    "dog bun":                      "hot dog bun",
    "slider size burger bun":       "hamburger bun",
    "brioche bun":                  "hamburger bun",
    "kaiser roll":                  "hamburger bun",
    "ciabatta":                     "bread italian",
    "baguette":                     "bread french",
    "naan":                         "pita bread",
    "buttery round cracker":        "crackers",
    "saltine cracker":              "crackers",
    "ritz cracker":                 "crackers",
    "graham cracker":               "crackers",
    "gyoza wrapper":                "wonton wrapper",
    "won ton wrapper":              "wonton wrapper",

    # Liquor / wines (approximations - alcohol macros)
    "bourbon":                      "whiskey",
    "rye whiskey":                  "whiskey",
    "scotch":                       "whiskey",
    "sherry":                       "wine white",
    "marsala":                      "wine red",
    "vermouth":                     "wine white",
    "mirin":                        "wine rice",
    "rice wine":                    "wine rice",
    "sake":                         "wine rice",

    # Sauces / condiments
    "old bay seasoning":            "spices mixed",
    "old bay seasoning tm":         "spices mixed",
    "italian seasoning":            "spices oregano",
    "herbes de provence":           "spices oregano",
    "adobo sauce from chipotle pepper": "tomato sauce",
    "chipotle peppers in adobo sauce":  "peppers chili",
    "individually wrapped caramel": "candy caramel",
    "multicolored candy sprinkle":  "sugar",
    "candy sprinkle":               "sugar",
    "rainbow sprinkle":             "sugar",
    "sprinkle":                     "sugar",

    # Misc
    "egg substitute":               "egg",
    "egg beater":                   "egg",
    "liquid egg white":             "egg white",
    "unfrosted cupcake":            "cake",
    "frosted cupcake":              "cake",
    "cupcake":                      "cake",

    # Grains / oats variants
    "polenta":                      "cornmeal",
    "instant polenta":              "cornmeal",
    "steel cut oat":                "oats",
    "steel cut oats":               "oats",
    "rolled oat":                   "oats",
    "rolled oats":                  "oats",
    "old fashioned oat":            "oats",
    "old fashioned oats":           "oats",
    "quick oat":                    "oats",
    "quick oats":                   "oats",
    "instant oat":                  "oats",
    "instant oats":                 "oats",

    # Mushroom variants
    "portobello mushroom":          "mushrooms",
    "portobello mushroom cap":      "mushrooms",
    "cremini mushroom":             "mushrooms",
    "shiitake mushroom":            "mushrooms",
    "button mushroom":              "mushrooms",
    "oyster mushroom":              "mushrooms",
    "porcini mushroom":             "mushrooms",
    "chanterelle":                  "mushrooms",
    "morel mushroom":               "mushrooms",

    # Specific clams / seafood variants
    "littleneck clam":              "clams raw",
    "manila clam":                  "clams raw",
    "cherrystone clam":             "clams raw",
    "fillets red snapper":          "snapper",
    "red snapper":                  "snapper",
    "red snapper fillet":           "snapper",
    "high quality ahi tuna":        "tuna raw",
    "ahi tuna":                     "tuna raw",
    "yellowfin tuna":               "tuna raw",
    "bluefin tuna":                 "tuna raw",
    "sashimi grade tuna":           "tuna raw",

    # Asian / international pantry items
    "kaffir lime leaf":             "lime",
    "kaffir lime leaves":           "lime",
    "kaffir lime leave":            "lime",  # singularizer output
    "dashi kombu":                  "seaweed kelp",
    "kombu":                        "seaweed kelp",
    "wakame":                       "seaweed",
    "nori":                         "seaweed",
    "fish sauce":                   "fish sauce",  # USDA has it
    "wasabi fumi furikake":         "seaweed",
    "furikake":                     "seaweed",

    # Baking mixes
    "all purpose biscuit baking mix": "pancake mix",
    "biscuit baking mix":           "pancake mix",
    "bisquick":                     "pancake mix",
    "pancake mix":                  "pancake mix",

    # Chiles
    "new mexico dried red chile pod": "peppers chili",
    "chile de arbol pepper":        "peppers chili",
    "dried chile":                  "peppers chili",
    "guajillo chile":               "peppers chili",
    "ancho chile":                  "peppers chili",
    "pasilla chile":                "peppers chili",

    # Misc liqueurs / sweets
    "amaretto liqueur":             "wine white",
    "amaretto":                     "wine white",
    "kahlua":                       "liqueur coffee",
    "grand marnier":                "liqueur orange",
    "cointreau":                    "liqueur orange",
    "triple sec":                   "liqueur orange",
    "regular size marshmallow":     "marshmallow",
    "mini marshmallow":             "marshmallow",
    "miniature marshmallow":        "marshmallow",
    "teddy bear shaped graham snack": "crackers",

    # Nut variants
    "untoasted walnut halve":       "walnut",
    "untoasted pecan halve":        "pecan",
    "walnut halve":                 "walnut",
    "pecan halve":                  "pecan",
    "almond halve":                 "almond",
    "blanched almond":              "almond",

    # Wraps
    "round rice wrapper sheet":     "rice paper",
    "rice paper sheet":             "rice paper",
    "rice paper wrapper":           "rice paper",
    "spring roll wrapper":          "rice paper",

    # Cooking apples
    "cooking apples peeled":        "apple",
    "granny smith apple":           "apple",
    "honeycrisp apple":             "apple",
    "fuji apple":                   "apple",

    # Misc niche
    "huckleberry":                  "blueberry",
    "red sorrel bud":               "spinach raw",
    "strips dried orange zest":     "orange peel",
    "pieces peeled and seeded zucchini": "zucchini",
    "pig tail":                     "pork",
}


def _strip_parens(s: str) -> str:
    """Remove parenthetical content: '(16 oz) package' -> ' package'."""
    return re.sub(r"\([^)]*\)", " ", s)


def _strip_noise(s: str) -> str:
    """Remove known noise phrases from anywhere in the string."""
    for phrase in NOISE_PHRASES:
        s = re.sub(r"\b" + re.escape(phrase) + r"\b", " ", s, flags=re.IGNORECASE)
    return s


def _strip_leading_qualifiers(s: str) -> str:
    """Repeatedly strip the longest leading qualifier until nothing matches."""
    changed = True
    while changed:
        changed = False
        for qual in LEADING_QUALIFIERS:
            if s.startswith(qual + " "):
                s = s[len(qual) + 1:].lstrip()
                changed = True
                break
            if s == qual:
                return ""
    return s


def _singularize(word: str) -> str:
    if word in NON_PLURAL_WHITELIST or len(word) <= 3:
        return word
    for pat, repl in PLURAL_RULES:
        if pat.search(word):
            return pat.sub(repl, word)
    return word


def normalize_ingredient_name(raw: str) -> str:
    """
    Convert a recipe ingredient `name` field into a normalized noun phrase
    suitable for USDA matching, or "" if the ingredient should be skipped.
    """
    if not raw:
        return ""

    s = raw.lower().strip()

    # Drop parentheticals first (they typically encode size/package info)
    s = _strip_parens(s)

    # Truncate at first comma: everything after is usually prep instruction
    # ("peeled and deveined", "trimmed and cut into 1 inch pieces").
    if "," in s:
        s = s.split(",", 1)[0]

    # Drop noise phrases
    s = _strip_noise(s)

    # Collapse whitespace
    s = re.sub(r"[\s\-]+", " ", s).strip()
    s = s.replace("/", " ")
    s = re.sub(r"\s+", " ", s).strip()

    # Remove leading numbers ("3 chopped onions" leaks into name when quantity parsing fails)
    s = re.sub(r"^[\d\s/¼-¾⅐-⅞.]+", "", s).strip()

    # Strip qualifiers off the front
    s = _strip_leading_qualifiers(s)

    # Trailing "for X" remnants
    s = re.sub(r"\bfor (the )?(garnish|serving|topping|drizzling|brushing|cooking|frying)$", "", s).strip()

    # Final tidy
    s = re.sub(r"\s+", " ", s).strip(" .,;")

    if not s:
        return ""

    # Negligible bucket (pre-singularize check, catches "salt and pepper" etc.)
    if s in NEGLIGIBLE_INGREDIENTS:
        return ""

    # Singularize the last word only (most foods are plural-tail like "tomatoes" -> "tomato")
    tokens = s.split()
    if tokens:
        tokens[-1] = _singularize(tokens[-1])
        s = " ".join(tokens)

    # Post-singularize check too — catches "toothpicks" -> "toothpick" cases.
    if s in NEGLIGIBLE_INGREDIENTS:
        return ""

    # Apply specialty alias map — rewrites niche/brand names to closest USDA
    # entry so the matcher can find macros. See INGREDIENT_ALIASES above.
    if s in INGREDIENT_ALIASES:
        return INGREDIENT_ALIASES[s]

    return s


def is_negligible(raw: str) -> bool:
    """Helper: True if this ingredient contributes ~0 macros and can be ignored."""
    return normalize_ingredient_name(raw) == ""
