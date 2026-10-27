"""Build a reproducible distributable source ZIP using only Python's standard library."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {"README.md", "LICENSE", "server.mjs", "package.json", ".gitignore"}
SOURCE_DIRS = ("dist", "tests", "scripts", ".github")
EXCLUDED_PARTS = {".git", ".openai", "node_modules", "__pycache__"}


def source_files():
    files = [ROOT / name for name in ROOT_FILES]
    for directory in SOURCE_DIRS:
        files.extend((ROOT / directory).rglob("*"))
    for path in sorted(set(files)):
        relative = path.relative_to(ROOT)
        if not path.is_file() or path.is_symlink():
            continue
        if any(part in EXCLUDED_PARTS for part in relative.parts):
            continue
        if path.suffix.lower() in {".zip", ".pyc", ".log"} or path.name.startswith(".env"):
            continue
        yield path, relative.as_posix()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "source.zip")
    args = parser.parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        count = 0
        for path, relative in source_files():
            info = ZipInfo("solar-voyager/" + relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)
            count += 1
    print(f"Packaged {count} files: {output.name} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
