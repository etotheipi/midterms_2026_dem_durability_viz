"""Copy the static app into the docs/ directory published by GitHub Pages."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
source = root / 'dist'
destination = root / 'docs'
shutil.copytree(source, destination, dirs_exist_ok=True)
print(f'GitHub Pages files prepared in {destination}')
