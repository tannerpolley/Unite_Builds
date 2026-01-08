"""
Download Unite Move Images Only
Simple script to download just the Unite Move images for all Pokemon
"""

from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException
import requests
from bs4 import BeautifulSoup
import json
import time
import os
import logging
from urllib.parse import urljoin

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class UniteMoveImageDownloader:
    """Simple downloader for Unite Move images"""

    BASE_URL = "https://unite-db.com"
    POKEMON_URL = f"{BASE_URL}/pokemon"

    def __init__(self):
        self.pokemon_data = {}
        self.driver = None
        self.load_pokemon_database()
        self.create_image_directory()

    def load_pokemon_database(self):
        """Load existing Pokemon database"""
        try:
            with open('static/json/all_pokemon_detailed.json', 'r', encoding='utf-8') as f:
                self.pokemon_data = json.load(f)
            logger.info(f"Loaded {len(self.pokemon_data)} Pokemon from database")
        except FileNotFoundError:
            logger.error("Database not found!")
            self.pokemon_data = {}

    def create_image_directory(self):
        """Create Unite_Moves directory"""
        unite_moves_dir = 'static/img/Unite_Moves'
        if not os.path.exists(unite_moves_dir):
            os.makedirs(unite_moves_dir)
            logger.info(f"Created directory: {unite_moves_dir}")

    def setup_driver(self):
        """Setup Chrome WebDriver"""
        options = webdriver.ChromeOptions()
        options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

        try:
            self.driver = webdriver.Chrome(options=options)
            logger.info("Chrome WebDriver initialized")
        except Exception as e:
            logger.error(f"Error initializing WebDriver: {e}")
            raise

    def close_driver(self):
        """Close WebDriver"""
        if self.driver:
            self.driver.quit()
            logger.info("WebDriver closed")

    def download_image(self, image_url: str, save_path: str) -> bool:
        """Download image from URL"""
        try:
            if not image_url.startswith('http'):
                image_url = urljoin(self.BASE_URL, image_url)

            response = requests.get(image_url, timeout=10)
            response.raise_for_status()

            with open(save_path, 'wb') as f:
                f.write(response.content)

            logger.info(f"Downloaded: {os.path.basename(save_path)}")
            return True

        except Exception as e:
            logger.error(f"Failed to download from {image_url}: {e}")
            return False

    def get_unite_move_image(self, pokemon_unite_db_name: str, pokemon_preferred_name: str):
        """Get Unite Move image for a single Pokemon"""
        url = f"{self.POKEMON_URL}/{pokemon_unite_db_name}"
        logger.info(f"Fetching Unite Move image for {pokemon_preferred_name}")

        try:
            self.driver.get(url)

            # Wait for content
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.CLASS_NAME, "full-details"))
            )
            time.sleep(3)

            # Parse HTML
            html = self.driver.page_source
            soup = BeautifulSoup(html, 'html.parser')

            # Find Unite Move
            unite_skill = soup.find('div', class_='skill Unite Move')
            if not unite_skill:
                logger.warning(f"No Unite Move found for {pokemon_preferred_name}")
                return None

            ultimate_div = unite_skill.find('div', class_='ultimate-ability')
            if not ultimate_div:
                logger.warning(f"No ultimate-ability div for {pokemon_preferred_name}")
                return None

            # Get Unite Move name
            info_div = ultimate_div.find('div', class_='info')
            unite_move_name = ""
            if info_div:
                name_elem = info_div.find('h2')
                if name_elem:
                    unite_move_name = name_elem.get_text().strip()

            # Get image (look for ability-icon with data-src for lazy loading)
            img_elem = ultimate_div.find('img', class_='ability-icon')
            if img_elem:
                # Check data-src first (lazy loaded), then src as fallback
                image_url = img_elem.get('data-src') or img_elem.get('src')
            else:
                image_url = None

            if image_url:

                if unite_move_name:
                    filename = f"{pokemon_preferred_name} - {unite_move_name}.png"
                    save_path = os.path.join('static', 'img', 'Unite_Moves', filename)

                    if self.download_image(image_url, save_path):
                        return filename

            logger.warning(f"Could not extract image for {pokemon_preferred_name}")
            return None

        except TimeoutException:
            logger.error(f"Timeout loading page for {pokemon_preferred_name}")
            return None
        except Exception as e:
            logger.error(f"Error processing {pokemon_preferred_name}: {e}")
            return None

    def download_all_images(self):
        """Download all Unite Move images"""
        self.setup_driver()

        try:
            count = 0
            total = len(self.pokemon_data)

            for preferred_name, data in self.pokemon_data.items():
                count += 1
                logger.info(f"Progress: {count}/{total}")

                unite_db_name = data.get('unite-db-name')
                if not unite_db_name:
                    logger.warning(f"No unite-db-name for {preferred_name}, skipping")
                    continue

                # Download image
                image_filename = self.get_unite_move_image(unite_db_name, preferred_name)

                # Update JSON data
                if image_filename:
                    if 'Unite Move' not in self.pokemon_data[preferred_name]:
                        self.pokemon_data[preferred_name]['Unite Move'] = {}
                    self.pokemon_data[preferred_name]['Unite Move']['Image'] = image_filename

                # Small delay between requests
                if count < total:
                    time.sleep(1.5)

        finally:
            self.close_driver()

        logger.info(f"Finished downloading Unite Move images!")

    def save_database(self):
        """Save updated database"""
        try:
            with open('static/json/all_pokemon_detailed.json', 'w', encoding='utf-8') as f:
                json.dump(self.pokemon_data, f, indent=2, ensure_ascii=False)
            logger.info("Database updated successfully")
        except Exception as e:
            logger.error(f"Error saving database: {e}")


def main():
    downloader = UniteMoveImageDownloader()
    downloader.download_all_images()
    downloader.save_database()

    print("\n" + "="*60)
    print("Unite Move Image Download Complete!")
    print("Images saved to: static/img/Unite_Moves/")
    print("JSON updated: static/json/all_pokemon_detailed.json")
    print("="*60)


if __name__ == "__main__":
    main()
