"""Normalize image formats and sizes under static/img."""

from pathlib import Path

from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parents[1]
STATIC_IMG_ROOT = REPO_ROOT / "static" / "img"
DEFAULT_SIZE = (128, 128)
BATTLE_ITEM_SIZE = (64, 64)
SUPPORTED_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}


def get_target_size(image_path: Path) -> tuple[int, int]:
    if "Battle_Items" in image_path.parts:
        return BATTLE_ITEM_SIZE
    return DEFAULT_SIZE


def normalize_image(image: Image.Image, target_size: tuple[int, int]) -> Image.Image:
    rgba_image = image.convert("RGBA")
    fitted_image = ImageOps.contain(rgba_image, target_size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", target_size, (0, 0, 0, 0))
    offset = (
        (target_size[0] - fitted_image.width) // 2,
        (target_size[1] - fitted_image.height) // 2,
    )
    canvas.paste(fitted_image, offset)
    return canvas


def format_static_images(image_root: Path | str = STATIC_IMG_ROOT) -> dict[str, int]:
    image_root = Path(image_root)
    summary = {
        "processed": 0,
        "converted": 0,
        "resized": 0,
        "skipped": 0,
        "errors": 0,
    }

    for image_path in sorted(image_root.rglob("*")):
        if not image_path.is_file() or image_path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue

        target_size = get_target_size(image_path)
        target_path = image_path.with_suffix(".png")

        try:
            with Image.open(image_path) as image:
                needs_conversion = image_path.suffix.lower() != ".png"
                needs_resize = image.size != target_size

                if not needs_conversion and not needs_resize:
                    summary["skipped"] += 1
                    continue

                normalized_image = normalize_image(image, target_size)
                normalized_image.save(target_path, format="PNG", optimize=True)

            if image_path != target_path and image_path.exists():
                image_path.unlink()
                summary["converted"] += 1
            elif needs_conversion:
                summary["converted"] += 1

            if needs_resize:
                summary["resized"] += 1

            summary["processed"] += 1
        except Exception as exc:
            summary["errors"] += 1
            print(f"Error formatting {image_path}: {exc}")
            continue

    return summary


def main() -> None:
    summary = format_static_images()
    print("Image formatting complete:")
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
