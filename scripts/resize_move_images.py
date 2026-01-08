"""
Resize Move Images to 128x128
This script resizes all move images in static/img/Moves to 128x128 pixels
"""

from PIL import Image
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def resize_images_in_directory(directory: str, target_size: tuple = (128, 128)):
    """
    Resize all images in a directory to target size

    Args:
        directory: Path to directory containing images
        target_size: Tuple of (width, height) for target size
    """

    # Get absolute path
    abs_directory = os.path.abspath(directory)
    logger.info(f"Looking in directory: {abs_directory}")

    if not os.path.exists(abs_directory):
        logger.error(f"Directory not found: {abs_directory}")
        return

    # Get all PNG files
    all_files = os.listdir(abs_directory)
    logger.info(f"Total files in directory: {len(all_files)}")

    image_files = [f for f in all_files if f.lower().endswith('.png')]
    logger.info(f"PNG files found: {len(image_files)}")

    if not image_files:
        logger.warning(f"No PNG files found in {abs_directory}")
        return

    logger.info(f"Found {len(image_files)} images to process in {abs_directory}")

    resized_count = 0
    skipped_count = 0
    error_count = 0

    for filename in image_files:
        filepath = os.path.join(abs_directory, filename)

        try:
            # Open image
            img = Image.open(filepath)

            # Check current size
            if img.size == target_size:
                logger.info(f"✓ {filename} - Already {target_size[0]}x{target_size[1]}, skipping")
                skipped_count += 1
                continue

            # Resize image using high-quality resampling
            logger.info(f"Resizing {filename} from {img.size[0]}x{img.size[1]} to {target_size[0]}x{target_size[1]}")
            img_resized = img.resize(target_size, Image.Resampling.LANCZOS)

            # Save back to same location
            img_resized.save(filepath, 'PNG', optimize=True)

            logger.info(f"✓ Resized: {filename}")
            resized_count += 1

        except Exception as e:
            logger.error(f"✗ Error processing {filename}: {e}")
            error_count += 1

    # Print summary
    print("\n" + "="*60)
    print("RESIZE SUMMARY")
    print("="*60)
    print(f"Total images found:    {len(image_files)}")
    print(f"Resized:               {resized_count}")
    print(f"Already correct size:  {skipped_count}")
    print(f"Errors:                {error_count}")
    print("="*60)


def main():
    """Main execution"""
    # Get the script's directory and navigate to project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)  # Go up one level from scripts/
    moves_directory = os.path.join(project_root, 'static', 'img', 'Moves')
    target_size = (128, 128)

    print("="*60)
    print("Move Image Resizer")
    print("="*60)
    print(f"Directory: {moves_directory}")
    print(f"Target size: {target_size[0]}x{target_size[1]} pixels")
    print("="*60)
    print()

    resize_images_in_directory(moves_directory, target_size)

    print("\nDone!")


if __name__ == "__main__":
    main()
