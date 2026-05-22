"""
Download USDA FoodData Central CSV datasets and extract into the layout that
usda_ingest.py expects.

Run this once before usda_ingest.py.

Usage:
  cd zeus-backend
  python scripts/download_usda.py
  python scripts/download_usda.py --dataset sr_legacy
  python scripts/download_usda.py --force          # re-download even if present

Downloads (free, no auth required):
  - SR Legacy:    ~30MB ZIP → ~120MB extracted
  - Foundation:   ~2MB  ZIP → ~10MB  extracted

Source pages:
  https://fdc.nal.usda.gov/download-datasets
  USDA publishes these as static ZIPs; URLs include a date stamp that changes
  on each release. We try the latest known stable URLs first and fall back to
  the page index if those 404.
"""

import argparse
import os
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "usda"

# USDA publishes CSV ZIPs with date-stamped filenames. These were current at
# the time this script was written; if USDA rotates filenames the download
# will 404 and we surface a clear error pointing the user at the index page.
DATASETS = {
    "sr_legacy": {
        "label":  "SR Legacy",
        "subdir": "sr_legacy",
        "urls": [
            # Latest stable SR Legacy release (April 2018, dataset is frozen)
            "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
        ],
    },
    "foundation": {
        "label":  "Foundation Foods",
        "subdir": "foundation",
        "urls": [
            # Try the most recent releases first; USDA refreshes ~twice a year.
            "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2024-10-31.zip",
            "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2024-04-18.zip",
            "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2023-10-26.zip",
            "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2023-04-20.zip",
        ],
    },
}


def download(url: str, dest: Path) -> bool:
    """Stream a URL to a file with a simple progress indicator."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Zeus-USDA-Ingest/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            total = int(resp.headers.get("Content-Length") or 0)
            downloaded = 0
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded / total * 100
                        sys.stdout.write(f"\r    {downloaded/1e6:6.1f} MB / {total/1e6:6.1f} MB ({pct:5.1f}%)")
                    else:
                        sys.stdout.write(f"\r    {downloaded/1e6:6.1f} MB")
                    sys.stdout.flush()
        print()
        return True
    except Exception as e:
        # Clean up partial file on failure so retries start clean.
        if dest.exists():
            dest.unlink()
        print(f"\n    failed: {e}")
        return False


def extract(zip_path: Path, dest_dir: Path) -> None:
    """Extract the ZIP into dest_dir. USDA ZIPs already include a top-level folder."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest_dir)


def already_present(subdir: Path) -> bool:
    """True if food.csv and food_nutrient.csv exist anywhere under subdir."""
    if not subdir.exists():
        return False
    needed = {"food.csv", "food_nutrient.csv"}
    for path in subdir.rglob("*"):
        if path.name in needed:
            needed.discard(path.name)
    return not needed


def process_dataset(key: str, force: bool) -> bool:
    info = DATASETS[key]
    subdir = DATA_DIR / info["subdir"]
    label = info["label"]
    print(f"\n=== {label} ===")

    if already_present(subdir) and not force:
        print(f"  Already extracted at {subdir} (use --force to re-download)")
        return True

    if force and subdir.exists():
        print(f"  --force: clearing {subdir}")
        shutil.rmtree(subdir)

    # Try each known URL in order until one succeeds
    zip_path = DATA_DIR / f"{key}.zip"
    success = False
    for url in info["urls"]:
        print(f"  Trying {url}")
        if download(url, zip_path):
            success = True
            break

    if not success:
        print(f"  All download URLs for {label} failed.")
        print(f"  USDA may have rotated the filename. Visit")
        print(f"    https://fdc.nal.usda.gov/download-datasets")
        print(f"  download the {label} CSV ZIP manually, and extract it into")
        print(f"    {subdir}")
        return False

    print(f"  Extracting to {subdir}...")
    extract(zip_path, subdir)

    print(f"  Cleaning up {zip_path.name}")
    zip_path.unlink()

    if not already_present(subdir):
        print(f"  WARNING: food.csv / food_nutrient.csv not found after extraction.")
        return False

    print(f"  OK")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        choices=["all", "sr_legacy", "foundation"],
        default="all",
    )
    parser.add_argument("--force", action="store_true", help="re-download even if files exist")
    args = parser.parse_args()

    print(f"USDA data directory: {DATA_DIR}")
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    datasets = ["sr_legacy", "foundation"] if args.dataset == "all" else [args.dataset]
    results = {key: process_dataset(key, args.force) for key in datasets}

    print()
    if all(results.values()):
        print("All datasets ready. Next: python scripts/usda_ingest.py")
    else:
        failed = [k for k, ok in results.items() if not ok]
        print(f"Failed: {', '.join(failed)}. See instructions above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
