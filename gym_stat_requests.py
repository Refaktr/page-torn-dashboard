import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

from general_battlestat_grapher import plot_after_over_time

load_dotenv()  # Load environment variables from .env file

# Get API key from .env file
API_KEY = os.getenv('TORN_API_KEY')

url = f"https://api.torn.com/v2/user/log?log=5300%2C5302%2C5301%2C5303&key={API_KEY}"

STAT_CATEGORIES = {
    5300: {"label": "Strength", "after_key": "strength_after"},
    5301: {"label": "Defense", "after_key": "defense_after"},
    5302: {"label": "Speed", "after_key": "speed_after"},
    5303: {"label": "Dexterity", "after_key": "dexterity_after"},
}

def get_data_from_api(url):
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an error for bad responses (4xx and 5xx)
        data = response.json()  # Parse the JSON response
        return data
    except requests.exceptions.RequestException as e:
        print(f"An error occurred: {e}")
        return None


if not API_KEY:
    raise ValueError("Missing TORN_API_KEY environment variable.")

data = get_data_from_api(url)

if data:
    # Print the entire JSON response for debugging purposes
    print(json.dumps(data, indent=4))

    log_entries = [entry for entry in data.get('log', []) if entry and entry.get('data') and entry.get('details')]

    entries_by_category = {category_id: [] for category_id in STAT_CATEGORIES}
    for entry in log_entries:
        category_id = entry.get('details', {}).get('id')
        if category_id in entries_by_category:
            entries_by_category[category_id].append(entry)

    for category_id, category_meta in STAT_CATEGORIES.items():
        stat_label = category_meta['label']
        after_key = category_meta['after_key']
        category_entries = entries_by_category[category_id]

        if not category_entries:
            print(f"No entries found for {stat_label} ({category_id}).")
            continue

        # Torn logs are typically newest-first. Reverse to oldest-first so the last value
        # written on the same date is the final "after" value for that date.
        category_entries.reverse()

        after_package = {}

        for entry in category_entries:
            timestamp = entry['timestamp']
            readable_time = datetime.fromtimestamp(timestamp).strftime('%d/%m/%Y')

            after_value = entry['data'].get(after_key)
            if after_value is None:
                continue

            after_package[readable_time] = float(after_value)

        if not after_package:
            print(f"No valid '{after_key}' values found for {stat_label} ({category_id}).")
            continue

        output_path = f"{stat_label.lower()}_after_over_time.png"
        print(f"Plotting {stat_label} ({category_id}) to {output_path}...")
        plot_after_over_time(after_package, stat_label=stat_label, output_path=output_path)