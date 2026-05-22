#!/usr/bin/env python3
"""
Expand the ingredient_library from ~532 to 1,500-2,000 entries.
Checks for duplicates (case-insensitive) before inserting.
"""
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from app.database import get_database


def get_new_ingredients():
    """Return a comprehensive list of new ingredients to add."""

    ingredients = []

    def add(name, category, units):
        ingredients.append({"name": name, "category": category, "common_units": units})

    # =========================================================================
    # PRODUCE - Exotic Fruits
    # =========================================================================
    for name in [
        "Dragon Fruit", "Passion Fruit", "Lychee", "Starfruit", "Guava",
        "Persimmon", "Kumquat", "Jackfruit", "Rambutan", "Durian",
        "Plantain", "Tamarind", "Blood Orange", "Meyer Lemon", "Key Lime",
        "Pomelo", "Quince", "Gooseberry", "Mulberry", "Elderberry",
        "Acai Berry", "Goji Berry", "Longan", "Soursop", "Cherimoya",
        "Feijoa", "Cactus Pear", "Ugli Fruit", "Sapodilla", "Mangosteen",
        "Breadfruit", "Ackee", "Carambola", "Custard Apple", "Wood Apple",
        "Jujube", "Salak", "Langsat", "Rose Apple", "Miracle Fruit",
        "Yuzu Fruit", "Calamansi", "Finger Lime", "Buddha's Hand", "Marionberry",
        "Boysenberry", "Lingonberry", "Cloudberry", "Huckleberry", "Loganberry",
        "Tayberry", "Currant", "Red Currant", "Black Currant", "White Currant",
        "Damson Plum", "Greengage", "Mirabelle Plum", "Pluot", "Aprium",
        "Tangelo", "Clementine", "Satsuma", "Mandarin Orange", "Minneola",
        "Cara Cara Orange", "Navel Orange",
    ]:
        add(name, "Produce", ["pieces", "cups", "lbs"])

    # Specialty Vegetables
    for name in [
        "Radicchio", "Endive", "Belgian Endive", "Fennel", "Fennel Bulb",
        "Kohlrabi", "Celeriac", "Rutabaga", "Daikon Radish",
        "Watercress", "Mizuna", "Mustard Greens", "Tatsoi",
        "Microgreens", "Bean Sprouts", "Bamboo Shoots", "Water Chestnuts",
        "Hearts of Palm", "Artichoke Hearts", "Sun-Dried Tomatoes",
        "Roasted Red Peppers", "Leek", "Ramps", "Fiddlehead Ferns",
        "Jicama", "Chayote", "Taro", "Yuca", "Malanga",
        "Boniato", "Lotus Root", "Burdock Root", "Galangal",
        "Turmeric Root", "Ginger Root", "Horseradish Root",
        "Sunchoke", "Cardoon", "Romanesco", "Broccolini", "Broccoflower",
        "Chinese Broccoli", "Gai Lan", "Yu Choy", "Choy Sum",
        "Rapini", "Dandelion Greens", "Amaranth Greens", "Purslane",
        "Sorrel", "Mache", "Frisee", "Escarole", "Chicory",
        "Cress", "Pea Shoots", "Sunflower Sprouts", "Alfalfa Sprouts",
        "Radish Sprouts", "Broccoli Sprouts", "Wheatgrass",
        "Dulse", "Kombu", "Nori", "Wakame", "Hijiki", "Kelp",
        "Calabash", "Bitter Melon", "Luffa", "Long Bean",
        "Winged Bean", "Hyacinth Bean", "Drumstick (Moringa)",
        "Banana Blossom", "Banana Leaf", "Pandan Leaf",
        "Grape Leaves", "Perilla Leaves", "Shiso",
        "Nopal Cactus", "Verdolaga", "Huauzontle",
        "Chinese Long Beans", "Thai Eggplant", "Japanese Eggplant",
        "Indian Eggplant", "Fairy Tale Eggplant",
        "Kabocha Squash", "Delicata Squash", "Honeynut Squash",
        "Carnival Squash", "Turban Squash", "Pattypan Squash",
        "Gem Squash", "Chayote Squash",
    ]:
        add(name, "Produce", ["pieces", "cups", "lbs", "bunches"])

    # Mushrooms
    for name in [
        "Maitake Mushroom", "Enoki Mushroom", "King Trumpet Mushroom",
        "Chanterelle Mushroom", "Porcini Mushroom", "Morel Mushroom",
        "White Truffle", "Black Truffle", "Truffle Oil",
        "Lion's Mane Mushroom", "Hedgehog Mushroom", "Matsutake Mushroom",
        "Wood Ear Mushroom", "Cloud Ear Mushroom", "Lobster Mushroom",
        "Beech Mushroom", "Nameko Mushroom", "Pioppini Mushroom",
        "Black Trumpet Mushroom", "Hen of the Woods",
    ]:
        add(name, "Produce", ["oz", "cups", "lbs"])

    # Fresh Herbs
    for name in [
        "Chervil", "Marjoram", "Lemongrass", "Thai Basil",
        "Curry Leaves", "Kaffir Lime Leaves", "Epazote", "Lavender",
        "Purple Basil", "Opal Basil", "Lemon Basil",
        "Lemon Thyme", "Lemon Verbena", "Bay Laurel",
        "Oregano Fresh", "Savory", "Summer Savory", "Winter Savory",
        "Hyssop", "Borage", "Bergamot", "Chamomile Fresh",
        "Peppermint Fresh", "Spearmint Fresh", "Chocolate Mint",
        "Vietnamese Coriander", "Culantro", "Papalo",
        "Mexican Oregano", "Mexican Marigold", "Rue",
        "Lovage", "Angelica", "Sweet Cicely",
        "Woodruff", "Costmary", "Salad Burnet",
        "Toronjil", "Hierba Buena", "Recao",
    ]:
        add(name, "Produce", ["bunches", "cups", "tbsp"])

    # =========================================================================
    # PROTEINS
    # =========================================================================
    # Fish
    for name in [
        "Branzino", "Red Snapper", "Sardines", "Anchovies",
        "Mackerel", "Ahi Tuna", "Yellowtail", "Arctic Char",
        "Barramundi", "Grouper", "Monkfish", "Skate",
        "John Dory", "Turbot", "Sole", "Flounder",
        "Haddock", "Pollock", "Walleye", "Perch",
        "Pike", "Smelt", "Whitefish", "Bluefish",
        "Amberjack", "Wahoo", "Opah", "Pompano",
        "Wreckfish", "Cobia", "Lingcod", "Rockfish",
        "Black Cod", "Sablefish", "Orange Roughy", "Chilean Sea Bass",
        "Escolar", "Ono", "Mako Shark", "Sturgeon",
    ]:
        add(name, "Protein", ["oz", "lbs", "fillets"])

    # Shellfish
    for name in [
        "Crawfish", "Langoustine", "Cuttlefish",
        "Abalone", "Conch", "Whelk", "Periwinkle",
        "Sea Urchin", "Geoduck", "Razor Clams",
        "Littleneck Clams", "Manila Clams", "Cockles",
        "Dungeness Crab", "King Crab", "Snow Crab", "Soft Shell Crab",
        "Rock Shrimp", "Spot Prawns", "Tiger Shrimp", "Royal Red Shrimp",
    ]:
        add(name, "Protein", ["oz", "lbs", "pieces"])

    # Specialty Meats
    for name in [
        "Duck Breast", "Duck Leg", "Duck Confit",
        "Lamb Shank", "Lamb Shoulder", "Rack of Lamb", "Lamb Loin",
        "Veal Chop", "Veal Shank", "Veal Shoulder", "Veal Scallopini",
        "Venison", "Venison Loin", "Venison Stew Meat",
        "Bison", "Bison Burger", "Bison Steak",
        "Rabbit", "Quail", "Pheasant", "Squab", "Guinea Fowl",
        "Bone Marrow", "Oxtail",
        "Pork Belly", "Pork Jowl", "Pork Shank",
        "Pancetta", "Bresaola", "Guanciale",
        "Andouille Sausage", "Merguez",
        "Mortadella", "Sopressata", "Capicola", "Nduja",
        "Blood Sausage", "Boudin Blanc", "Boudin Noir",
        "Confit Duck Gizzard", "Foie Gras", "Pate",
        "Beef Tongue", "Beef Cheek", "Beef Heart",
        "Lamb Sweetbreads", "Veal Sweetbreads",
        "Chicken Liver", "Duck Liver",
        "Elk", "Wild Boar", "Goat Meat", "Mutton",
        "Kangaroo", "Ostrich", "Alligator", "Frog Legs",
        "Escargot", "Beef Jerky", "Turkey Jerky",
        "Bacon Lardons", "Salt Pork", "Fatback",
        "Country Ham", "Serrano Ham", "Iberico Ham",
        "Speck", "Lardo", "Coppa",
    ]:
        add(name, "Protein", ["oz", "lbs", "pieces"])

    # Plant Proteins
    for name in [
        "Black-Eyed Peas", "Brown Lentils", "French Lentils",
        "Butter Beans", "Fava Beans", "Mung Beans",
        "Adzuki Beans", "Cranberry Beans", "Scarlet Runner Beans",
        "Lupini Beans", "Pigeon Peas", "Urad Dal",
        "Chana Dal", "Moong Dal", "Toor Dal", "Masoor Dal",
        "TVP (Textured Vegetable Protein)", "Soy Curls",
        "Beyond Meat", "Impossible Burger",
        "Jackfruit (Canned)", "Pea Protein Powder",
        "Hemp Protein Powder", "Soy Protein Isolate",
        "Natto", "Tofu Skin", "Dried Tofu", "Smoked Tofu",
    ]:
        add(name, "Protein", ["oz", "cups", "lbs"])

    # =========================================================================
    # PASTA SHAPES
    # =========================================================================
    for name in [
        "Orecchiette", "Farfalle", "Rotini", "Cavatappi",
        "Gemelli", "Radiatori", "Campanelle", "Paccheri",
        "Bucatini", "Pappardelle", "Tagliatelle",
        "Ditalini", "Acini de Pepe", "Manicotti",
        "Cannelloni", "Lasagna Sheets", "Gnocchi",
        "Agnolotti", "Pici", "Trofie", "Maltagliati",
        "Calamarata", "Casarecce", "Strozzapreti", "Mafaldine",
        "Conchiglie", "Lumache", "Garganelli", "Cavatelli",
        "Pizzoccheri", "Bigoli", "Chitarra", "Corzetti",
        "Pappardelle Nest", "Capellini", "Vermicelli",
        "Ziti", "Ditali", "Tubetti", "Mezze Maniche",
        "Gigli", "Foglie d'Ulivo", "Stelline", "Pastina",
    ]:
        add(name, "Grains", ["oz", "lbs", "boxes"])

    # =========================================================================
    # CHEESE VARIETIES
    # =========================================================================
    for name in [
        "Pecorino Romano", "Emmental",
        "Roquefort", "Stilton", "Manchego",
        "Halloumi", "Paneer", "Queso Fresco", "Cotija",
        "Burrata", "Ricotta Salata", "Mascarpone",
        "Fontina", "Jarlsberg", "Comte",
        "Taleggio", "Edam", "Limburger",
        "Raclette", "Reblochon", "Epoisses", "Morbier",
        "Cantal", "Ossau-Iraty", "Roquefort Blue",
        "Valdeon", "Cabrales", "Idiazabal", "Tetilla",
        "Mahon", "Queso Manchego Curado",
        "Parmigiano Reggiano", "Grana Padano", "Piave",
        "Toma", "Robiola", "Stracchino", "Scamorza",
        "Caciocavallo", "Primo Sale", "Tuma",
        "Queso Oaxaca", "Queso Chihuahua", "Queso Panela",
        "Queso Anejo", "Queso de Bola",
        "Labneh", "Akkawi", "Nabulsi", "Shanklish",
        "Feta Barrel-Aged", "Kasseri", "Graviera", "Kefalotiri",
        "Mizithra", "Manouri", "Anthotyros",
        "Smoked Gouda", "Smoked Cheddar", "Smoked Mozzarella",
        "Truffle Cheese", "Herb-Crusted Brie",
        "Boursin", "Laughing Cow", "Velveeta",
        "Cheese Curds", "Quark", "Skyr", "Fromage Blanc",
    ]:
        add(name, "Dairy", ["oz", "lbs", "cups", "slices"])

    # =========================================================================
    # INTERNATIONAL CONDIMENTS & SAUCES
    # =========================================================================
    for name in [
        "Gochujang", "Gochugaru", "Doenjang", "Mirin",
        "Sambal Oelek", "Chili Garlic Sauce",
        "Harissa", "Za'atar", "Sumac",
        "Ras el Hanout", "Berbere", "Dukkah",
        "Furikake", "Togarashi", "Shichimi Togarashi",
        "Ponzu", "Yuzu Juice", "Tamarind Paste",
        "Coconut Aminos", "Liquid Smoke",
        "Anchovy Paste", "Cornichons", "Preserved Lemons",
        "Mango Chutney", "Mint Chutney", "Tamarind Chutney",
        "Chimichurri", "Sofrito", "Achiote Paste",
        "Mole Sauce", "Chipotle in Adobo",
        "Red Curry Paste", "Green Curry Paste", "Yellow Curry Paste",
        "Massaman Curry Paste", "Tom Yum Paste",
        "Laksa Paste", "Rendang Paste",
        "XO Sauce", "Black Bean Sauce", "Shaoxing Wine",
        "Chili Crisp", "Lao Gan Ma", "Doubanjiang",
        "Tianmian Sauce", "Char Siu Sauce",
        "Tonkatsu Sauce", "Okonomiyaki Sauce", "Yakisoba Sauce",
        "Unagi Sauce", "Warishita", "Tsuyu",
        "Dashi Powder", "Bonito Flakes", "Kombu Dashi",
        "Nam Pla Prik", "Sweet Chili Sauce",
        "Peanut Sauce", "Satay Sauce",
        "Romesco Sauce", "Bagna Cauda", "Salsa Verde (Italian)",
        "Salsa Roja", "Salsa Macha", "Salsa Taquera",
        "Aji Amarillo Paste", "Aji Panca Paste",
        "Recaudo", "Pepian Sauce",
        "Zhug", "Schug", "Amba Sauce",
        "Tkemali", "Adjika", "Satsebeli",
        "Muhammara", "Toum", "Zhoug",
        "Baba Ganoush", "Labneh Spread",
        "Fig Jam", "Onion Jam", "Tomato Jam",
        "Hot Honey", "Chili Honey",
        "Truffle Honey", "Manuka Honey",
        "Dijon Mustard", "Whole Grain Mustard",
        "English Mustard", "Chinese Hot Mustard",
        "Horseradish Sauce", "Wasabi Paste", "Wasabi Powder",
        "Pickled Ginger", "Sushi Ginger",
        "Kimchi", "Sauerkraut", "Pickled Jalapenos",
        "Pickled Red Onion", "Quick Pickles",
        "Giardiniera", "Pepperoncini",
        "Banana Peppers (Pickled)", "Sport Peppers",
        "Calabrian Chili Paste", "Nduja Spread",
        "Tapenade", "Olive Tapenade",
        "Aioli", "Remoulade", "Tartar Sauce",
        "Cocktail Sauce", "Mignonette Sauce",
        "Beurre Blanc", "Hollandaise Mix",
        "Bearnaise Mix", "Demi-Glace",
        "Veal Jus", "Beef Jus", "Chicken Jus",
    ]:
        add(name, "Condiments", ["tbsp", "cups", "jars", "oz"])

    # =========================================================================
    # GRAINS & STARCHES
    # =========================================================================
    for name in [
        "Freekeh", "Pearl Couscous",
        "Grits", "Semolina",
        "Teff", "Sorghum",
        "Sticky Rice", "Forbidden Rice",
        "Rice Noodles", "Udon Noodles", "Soba Noodles",
        "Glass Noodles", "Ramen Noodles", "Egg Noodles",
        "Wonton Wrappers", "Spring Roll Wrappers",
        "Phyllo Dough", "Puff Pastry",
        "Spelt", "Kamut", "Einkorn",
        "Triticale", "Wheat Berries",
        "Hominy", "Masa Harina", "Corn Tortillas", "Flour Tortillas",
        "Naan Bread", "Pita Bread", "Lavash",
        "Injera", "Roti", "Chapati", "Paratha",
        "Mantou", "Bao Buns", "Dumpling Wrappers",
        "Gyoza Wrappers", "Mochi Rice", "Rice Paper",
        "Tapioca Pearls", "Sago",
        "Potato Starch", "Rice Flour", "Glutinous Rice Flour",
        "Chickpea Flour", "Mung Bean Starch",
        "Sweet Potato Noodles", "Kelp Noodles",
        "Shirataki Noodles", "Konjac Noodles",
        "Rye Flour", "Pumpernickel Flour",
        "Teff Flour", "Sorghum Flour", "Millet Flour",
        "Cassava Flour", "Plantain Flour",
        "Breadfruit Flour", "Cricket Flour",
        "Panko (Japanese)", "Tempura Batter Mix",
    ]:
        add(name, "Grains", ["cups", "oz", "lbs", "packages"])

    # =========================================================================
    # BAKING & SWEETENERS
    # =========================================================================
    for name in [
        "Almond Flour", "Coconut Flour",
        "Tapioca Starch", "Arrowroot Powder",
        "Xanthan Gum", "Gelatin Powder", "Gelatin Sheets",
        "Agar-Agar", "Cream of Tartar",
        "Espresso Powder", "Dutch Process Cocoa",
        "Cacao Nibs", "Cacao Butter",
        "Meringue Powder", "Rose Water", "Orange Blossom Water",
        "Demerara Sugar", "Muscovado Sugar",
        "Palm Sugar", "Jaggery",
        "Golden Syrup", "Treacle",
        "Malt Syrup", "Brown Rice Syrup",
        "Date Syrup", "Pomegranate Molasses",
        "Glucose Syrup", "Invert Sugar",
        "Isomalt", "Erythritol", "Xylitol",
        "Allulose", "Sucralose",
        "Fondant", "Gum Paste", "Modeling Chocolate",
        "Cocoa Butter", "Couverture Chocolate",
        "Ruby Chocolate", "Gianduja",
        "Praline Paste", "Almond Paste", "Marzipan",
        "Pistachio Paste", "Hazelnut Paste",
        "Vanilla Bean", "Vanilla Bean Paste", "Vanilla Powder",
        "Lemon Extract", "Orange Extract", "Peppermint Extract",
        "Coconut Extract", "Rum Extract", "Butter Extract",
        "Citric Acid", "Tartaric Acid",
        "Pectin", "Fruit Pectin",
        "Baker's Ammonia", "Lye (Food Grade)",
        "Food Coloring", "Gel Food Coloring",
        "Sprinkles", "Nonpareils", "Sanding Sugar",
        "Pearl Sugar", "Nib Sugar",
        "Cake Decorating Fondant", "Royal Icing Mix",
        "Pie Weights", "Parchment Paper",
    ]:
        add(name, "Baking", ["cups", "tbsp", "tsp", "oz"])

    # =========================================================================
    # NUTS & SEEDS
    # =========================================================================
    for name in [
        "Marcona Almonds", "Blanched Almonds", "Slivered Almonds", "Sliced Almonds",
        "Poppy Seeds", "Nigella Seeds",
        "Caraway Seeds", "Fennel Seeds", "Celery Seeds",
        "Black Sesame Seeds", "White Sesame Seeds",
        "Sacha Inchi Seeds", "Watermelon Seeds",
        "Lotus Seeds", "Apricot Kernels",
        "Candlenut", "Kukui Nut",
        "Tiger Nuts", "Kola Nut",
        "Roasted Almonds", "Roasted Cashews", "Roasted Peanuts",
        "Honey Roasted Peanuts", "Candied Pecans", "Candied Walnuts",
        "Praline Pecans", "Spiced Nuts",
        "Mixed Nuts", "Nut Butter Blend",
        "Tahini Paste", "Sunflower Seed Butter",
        "Pumpkin Seed Butter", "Pistachio Butter",
        "Hazelnut Butter", "Pecan Butter",
        "Walnut Oil", "Pistachio Oil",
    ]:
        add(name, "Snacks", ["cups", "oz", "lbs"])

    # =========================================================================
    # OILS & VINEGARS
    # =========================================================================
    for name in [
        "Grapeseed Oil", "Toasted Sesame Oil",
        "Chili Oil", "Garlic-Infused Oil",
        "Duck Fat", "Lard", "Tallow", "Schmaltz",
        "Champagne Vinegar",
        "Balsamic Glaze",
        "Umeboshi Vinegar", "Black Vinegar", "Coconut Vinegar",
        "Malt Vinegar", "Cane Vinegar",
        "Herb-Infused Olive Oil", "Lemon Olive Oil",
        "Basil Oil", "Rosemary Oil",
        "White Truffle Oil", "Black Truffle Oil",
        "Mustard Oil", "Perilla Oil",
        "Camellia Oil", "Tea Seed Oil",
        "Macadamia Oil", "Almond Oil (Culinary)",
        "Hazelnut Oil", "Pumpkin Seed Oil",
        "Flaxseed Oil", "Hemp Seed Oil",
        "MCT Oil", "Butter-Flavored Oil",
    ]:
        add(name, "Oils & Vinegars", ["tbsp", "cups", "ml"])

    # =========================================================================
    # SPICES
    # =========================================================================
    for name in [
        "Cardamom", "Cardamom Pods", "Green Cardamom", "Black Cardamom",
        "Star Anise", "Cloves", "Whole Cloves",
        "Allspice", "Allspice Berries",
        "Nutmeg", "Whole Nutmeg", "Mace",
        "Fenugreek", "Fenugreek Seeds", "Fenugreek Leaves",
        "Turmeric Powder", "Saffron", "Saffron Threads",
        "Aleppo Pepper", "Ancho Chili Powder", "Chipotle Powder",
        "Cayenne Pepper", "Sichuan Peppercorn",
        "Pink Peppercorn", "Juniper Berries",
        "Coriander Seeds", "Ground Coriander",
        "Yellow Mustard Seeds", "Black Mustard Seeds", "Brown Mustard Seeds",
        "Celery Salt", "Smoked Paprika", "Sweet Paprika", "Hungarian Paprika",
        "Chinese Five-Spice", "Garam Masala", "Tandoori Masala",
        "Curry Powder", "Madras Curry Powder",
        "Old Bay Seasoning",
        "Herbes de Provence", "Bouquet Garni",
        "Smoked Salt", "Himalayan Pink Salt", "Fleur de Sel",
        "Black Hawaiian Salt", "Red Hawaiian Salt",
        "Sel Gris", "Maldon Sea Salt",
        "Garlic Salt", "Onion Salt",
        "Lemon Pepper", "Steak Seasoning",
        "Montreal Steak Seasoning", "Cajun Seasoning",
        "Creole Seasoning", "Blackening Seasoning",
        "Taco Seasoning", "Fajita Seasoning",
        "Chili Seasoning", "Pumpkin Pie Spice",
        "Apple Pie Spice", "Chai Spice Blend",
        "Baharat", "Advieh", "Panch Phoron",
        "Chaat Masala", "Kashmiri Chili Powder",
        "Urfa Biber", "Maras Pepper", "Pul Biber",
        "Espelette Pepper", "Piment d'Espelette",
        "Bird's Eye Chili (Dried)", "Guajillo Chili",
        "Pasilla Chili", "Cascabel Chili", "Arbol Chili",
        "Mulato Chili", "Morita Chili",
        "Korean Chili Flakes", "Kashmiri Chili Flakes",
        "Annatto Seeds", "Grains of Paradise",
        "Long Pepper", "Cubeb Pepper",
        "Asafoetida", "Kala Namak (Black Salt)",
        "Amchur (Dried Mango Powder)", "Anardana (Dried Pomegranate)",
        "Dried Lime", "Loomi",
        "Sumac Berry", "Barberry",
        "Nigella Sativa", "Black Cumin",
        "Ajwain", "Bishop's Weed",
        "Mahlab", "Mastic",
        "Tonka Bean", "Vanilla Sugar",
        "Cinnamon Stick", "Cassia Bark",
        "Ceylon Cinnamon", "Saigon Cinnamon",
        "Ground Ginger", "Dried Ginger",
        "Dried Oregano", "Dried Basil", "Dried Thyme",
        "Dried Rosemary", "Dried Sage", "Dried Dill",
        "Dried Parsley", "Dried Chives", "Dried Tarragon",
        "Dried Marjoram", "Dried Savory",
        "Dried Mint", "Dried Cilantro",
        "Dried Lemongrass", "Dried Curry Leaves",
        "Onion Flakes", "Garlic Flakes",
        "Dried Shallot", "Dried Leek",
        "Mushroom Powder", "Porcini Powder",
        "Truffle Salt", "Truffle Powder",
    ]:
        add(name, "Spices", ["tsp", "tbsp", "oz"])

    # =========================================================================
    # DAIRY & DAIRY ALTERNATIVES
    # =========================================================================
    for name in [
        "Cashew Milk", "Hemp Milk", "Flax Milk", "Rice Milk",
        "Pea Milk", "Macadamia Milk", "Pistachio Milk",
        "Oat Cream", "Coconut Cream (Canned)",
        "Soy Cream", "Cashew Cream",
        "Vegan Butter", "Vegan Cream Cheese", "Vegan Sour Cream",
        "Vegan Parmesan", "Vegan Mozzarella",
        "Kefir", "Buttermilk Powder",
        "Dry Milk Powder", "Malted Milk Powder",
        "Clotted Cream", "Creme Fraiche",
        "Double Cream", "Single Cream",
        "Dulce de Leche", "Cajeta",
        "Condensed Coconut Milk", "Coconut Yogurt",
        "Almond Yogurt", "Cashew Yogurt", "Oat Yogurt",
        "Icelandic Skyr", "Bulgarian Yogurt",
        "Goat Milk", "Sheep Milk",
        "A2 Milk", "Lactose-Free Milk",
        "Cultured Butter", "European-Style Butter",
        "Brown Butter", "Clarified Butter",
        "Butter Powder", "Cheese Powder",
    ]:
        add(name, "Dairy", ["cups", "oz", "lbs"])

    # =========================================================================
    # BEVERAGES
    # =========================================================================
    for name in [
        "Matcha", "Hojicha", "Genmaicha",
        "Pu-erh Tea", "White Tea", "Rooibos Tea",
        "Hibiscus Tea", "Yerba Mate",
        "Espresso Beans", "Decaf Coffee",
        "Cold Brew Coffee", "Chicory Coffee",
        "Tonic Water", "Club Soda", "Seltzer Water",
        "Coconut Water", "Aloe Vera Juice",
        "Pomegranate Juice", "Mango Juice", "Guava Juice",
        "Passion Fruit Juice", "Tamarind Juice",
        "Beet Juice", "Carrot Juice", "Celery Juice",
        "Tomato Juice (Fresh)", "V8 Juice",
        "Grenadine", "Simple Syrup", "Orgeat Syrup",
        "Elderflower Cordial", "Rose Syrup",
        "Lavender Syrup", "Vanilla Syrup",
        "Amaretto", "Kahlua", "Baileys", "Grand Marnier",
        "Triple Sec", "Cointreau", "Curacao",
        "Campari", "Aperol", "Fernet-Branca",
        "Angostura Bitters", "Orange Bitters",
        "Absinthe", "Chartreuse", "Benedictine",
        "Maraschino Liqueur", "Creme de Cassis",
        "Pisco", "Mezcal", "Cachaca",
        "Soju", "Shochu", "Baijiu",
        "Port Wine", "Sherry", "Madeira", "Marsala Wine",
        "Prosecco", "Cava", "Cider",
        "Mead", "Rice Wine", "Palm Wine",
        "Kvass", "Tepache", "Pulque",
    ]:
        add(name, "Beverages", ["cups", "oz", "bottles", "ml"])

    # =========================================================================
    # CANNED & JARRED
    # =========================================================================
    for name in [
        "Canned Chickpeas", "Canned Black Beans", "Canned Kidney Beans",
        "Canned Pinto Beans", "Canned Navy Beans",
        "Canned Cannellini Beans", "Canned Great Northern Beans",
        "Canned Butter Beans", "Canned Lima Beans",
        "Canned Lentils", "Canned Black-Eyed Peas",
        "Canned Corn", "Canned Green Beans",
        "Canned Peas", "Canned Carrots",
        "Canned Beets", "Canned Artichoke Hearts",
        "Canned Hearts of Palm", "Canned Bamboo Shoots",
        "Canned Water Chestnuts", "Canned Jackfruit",
        "Canned Coconut Milk", "Canned Coconut Cream",
        "Canned Tomato Sauce", "Canned San Marzano Tomatoes",
        "Canned Fire-Roasted Tomatoes", "Canned Tomato Puree",
        "Canned Roasted Red Peppers", "Canned Green Chiles",
        "Canned Chipotle Peppers",
        "Canned Pumpkin", "Canned Sweet Potato",
        "Canned Pineapple", "Canned Peaches",
        "Canned Mandarin Oranges", "Canned Pears",
        "Canned Cherries", "Canned Cranberry Sauce",
        "Canned Sardines", "Canned Anchovies",
        "Canned Salmon", "Canned Crab",
        "Canned Clams", "Canned Oysters",
        "Canned Chicken", "Canned Corned Beef",
        "Canned Spam", "Canned Vienna Sausages",
        "Jarred Olives", "Jarred Roasted Peppers",
        "Jarred Artichoke Hearts", "Jarred Sun-Dried Tomatoes",
        "Jarred Capers", "Jarred Cornichons",
        "Jarred Pickles", "Jarred Relish",
        "Jarred Pepperoncini", "Jarred Giardiniera",
        "Jarred Marinara", "Jarred Alfredo Sauce",
        "Jarred Pesto", "Jarred Tikka Masala Sauce",
        "Jarred Curry Sauce", "Jarred Pad Thai Sauce",
        "Jarred Applesauce", "Jarred Baby Food",
    ]:
        add(name, "Canned & Jarred", ["cans", "jars", "oz"])

    # =========================================================================
    # FROZEN
    # =========================================================================
    for name in [
        "Frozen Edamame", "Frozen Artichoke Hearts",
        "Frozen Okra", "Frozen Lima Beans",
        "Frozen Butternut Squash", "Frozen Sweet Potato",
        "Frozen Acai Packets", "Frozen Pitaya Packets",
        "Frozen Avocado", "Frozen Banana Slices",
        "Frozen Coconut Chunks", "Frozen Passion Fruit Pulp",
        "Frozen Guava Pulp", "Frozen Mango Chunks",
        "Frozen Shrimp", "Frozen Calamari",
        "Frozen Lobster Tails", "Frozen Crab Cakes",
        "Frozen Salmon Fillets", "Frozen Cod Fillets",
        "Frozen Tilapia Fillets", "Frozen Mahi Mahi",
        "Frozen Duck Breast", "Frozen Lamb Chops",
        "Frozen Turkey Burgers", "Frozen Veggie Burgers",
        "Frozen Ravioli", "Frozen Tortellini",
        "Frozen Gnocchi", "Frozen Pierogi",
        "Frozen Empanadas", "Frozen Samosas",
        "Frozen Spring Rolls", "Frozen Gyoza",
        "Frozen Dim Sum", "Frozen Tamales",
        "Frozen Naan", "Frozen Paratha",
        "Frozen Croissants", "Frozen Bread Dough",
        "Frozen Cookie Dough", "Frozen Phyllo Cups",
        "Frozen Puff Pastry Shells",
    ]:
        add(name, "Frozen", ["bags", "boxes", "oz", "lbs"])

    # =========================================================================
    # SNACKS & MISC
    # =========================================================================
    for name in [
        "Rice Cakes", "Corn Cakes", "Rice Crackers",
        "Seaweed Snacks", "Kale Chips", "Veggie Chips",
        "Pita Chips", "Bagel Chips", "Wonton Chips",
        "Plantain Chips", "Taro Chips", "Cassava Chips",
        "Pork Rinds", "Chicharrones",
        "Dried Mango", "Dried Pineapple", "Dried Papaya",
        "Dried Banana Chips", "Dried Apple Rings",
        "Dried Coconut Strips", "Freeze-Dried Strawberries",
        "Freeze-Dried Raspberries", "Freeze-Dried Blueberries",
        "Fruit Leather", "Fruit Snacks",
        "Energy Balls", "Protein Bites",
        "Nut Clusters", "Seed Crackers",
        "Cheese Crackers", "Animal Crackers",
        "Breadsticks", "Grissini",
        "Lavash Crackers", "Matzo",
        "Croutons", "Garlic Croutons",
        "French Fried Onions", "Wonton Strips",
        "Tortilla Strips", "Corn Nuts",
    ]:
        add(name, "Snacks", ["bags", "oz", "cups"])

    # =========================================================================
    # OTHER
    # =========================================================================
    for name in [
        "Nutritional Supplements", "Collagen Powder",
        "Spirulina Powder", "Chlorella Powder",
        "Wheatgrass Powder", "Barley Grass Powder",
        "Moringa Powder", "Ashwagandha Powder",
        "Maca Powder", "Acai Powder",
        "Beetroot Powder", "Turmeric Latte Mix",
        "Bone Broth Powder", "Collagen Peptides",
        "Whey Protein", "Casein Protein",
        "Electrolyte Powder", "Vitamin C Powder",
    ]:
        add(name, "Other", ["scoops", "tsp", "tbsp", "oz"])

    return ingredients


def main():
    db = get_database()

    # Get existing ingredient names (case-insensitive)
    print("Fetching existing ingredients...")
    existing_result = db.table("ingredient_library").select("name").execute()
    existing_names = {r["name"].lower() for r in existing_result.data}
    print(f"Found {len(existing_names)} existing ingredients.")

    # Get new ingredients
    all_new = get_new_ingredients()
    print(f"Candidate new ingredients: {len(all_new)}")

    # Filter out duplicates (case-insensitive)
    to_insert = [ing for ing in all_new if ing["name"].lower() not in existing_names]
    print(f"After dedup: {to_insert.__len__()} new ingredients to insert.")

    # Also deduplicate within our own list (case-insensitive)
    seen = set()
    deduped = []
    for ing in to_insert:
        key = ing["name"].lower()
        if key not in seen:
            seen.add(key)
            deduped.append(ing)
    to_insert = deduped
    print(f"After internal dedup: {len(to_insert)} ingredients to insert.")

    if not to_insert:
        print("Nothing to insert!")
        return

    # Count by category
    cat_counts = {}
    for ing in to_insert:
        cat_counts[ing["category"]] = cat_counts.get(ing["category"], 0) + 1
    print("\nBreakdown by category:")
    for cat, count in sorted(cat_counts.items()):
        print(f"  {cat:20s}: {count:3d}")

    # Insert in batches of 50
    batch_size = 50
    total_batches = (len(to_insert) + batch_size - 1) // batch_size
    success = 0
    errors = 0

    print(f"\nInserting {len(to_insert)} ingredients in {total_batches} batches...")

    for i in range(0, len(to_insert), batch_size):
        batch = to_insert[i : i + batch_size]
        batch_num = i // batch_size + 1
        try:
            db.table("ingredient_library").insert(batch).execute()
            success += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: Inserted {len(batch)} ingredients (total: {success})")
        except Exception as e:
            errors += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: ERROR - {str(e)[:150]}")

    # Final count
    final = db.table("ingredient_library").select("count", count="exact").execute()
    print(f"\n{'='*60}")
    print(f"Done! Inserted {success} new ingredients. Errors: {errors}")
    print(f"Total ingredients in database: {final.count}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
