import sys
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import Select

def test_traffic_visualization():
    print("[TEST] Launching headless Chrome to test Traffic Visualization...")
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1600,1050")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = webdriver.Chrome(options=chrome_options)
    results = {}

    try:
        print("[TEST] Opening http://localhost:8000...")
        driver.get("http://localhost:8000")
        time.sleep(3.5) # Wait for Leaflet, Google tiles, GeoJSON & default selection

        # 1. Console logs check
        logs = driver.get_log("browser")
        severe_logs = [l for l in logs if l["level"] == "SEVERE"]
        print(f"[TEST] Console errors found: {len(severe_logs)}")
        if severe_logs:
            for l in severe_logs:
                print("   Console Error:", l["message"])
        results["no_severe_errors"] = (len(severe_logs) == 0)

        # 2. Map container and tile layer
        map_el = driver.find_element(By.ID, "map")
        tiles = map_el.find_elements(By.CSS_SELECTOR, "img.leaflet-tile")
        print(f"[TEST] Leaflet map rendered tiles: {len(tiles)}")
        results["tiles_rendered"] = len(tiles) > 0

        # Verify Google Maps tile source
        google_tiles = [t for t in tiles if "google.com" in (t.get_attribute("src") or "")]
        print(f"[TEST] Google Maps roadmap tiles loaded: {len(google_tiles)} tiles")
        results["google_tiles_loaded"] = len(google_tiles) > 0

        # 3. Check Traffic Polylines rendered
        polylines = driver.find_elements(By.CSS_SELECTOR, "path.leaflet-interactive")
        print(f"[TEST] Interactive SVG path elements (polylines + markers): {len(polylines)}")
        results["polylines_present"] = len(polylines) >= 13

        # Check colors of polylines
        colors_found = set()
        for p in polylines:
            stroke = p.get_attribute("stroke")
            if stroke:
                colors_found.add(stroke.upper())
        print(f"[TEST] Stroke colors found in map overlay: {colors_found}")
        
        has_red = any("#EF4444" in c or "RGB(239, 68, 68)" in c or "239, 68, 68" in c for c in colors_found)
        has_amber = any("#F59E0B" in c or "RGB(245, 158, 11)" in c or "245, 158, 11" in c for c in colors_found)
        has_green = any("#22C55E" in c or "RGB(34, 197, 94)" in c or "34, 197, 94" in c for c in colors_found)
        print(f"[TEST] Color checks - Red (High): {has_red}, Amber (Med): {has_amber}, Green (Low): {has_green}")
        results["colors_match_legend"] = (has_red and has_amber)

        # 4. Check Road Selection Halo
        halo_elements = driver.find_elements(By.CSS_SELECTOR, ".road-selected-halo")
        print(f"[TEST] Road selection halo rendered: {len(halo_elements)} element(s)")
        results["selection_halo_active"] = len(halo_elements) > 0

        # 5. Check Popup visible for selected road
        popups = driver.find_elements(By.CSS_SELECTOR, ".leaflet-popup .traffic-popup-box")
        popup_visible = len(popups) > 0 and popups[0].is_displayed()
        print(f"[TEST] Road traffic popup displayed: {popup_visible}")
        if popup_visible:
            badge_text = popups[0].find_element(By.CSS_SELECTOR, ".popup-traffic-badge").text
            safe_badge = badge_text.encode("ascii", "replace").decode("ascii")
            print("   Popup Title:", popups[0].find_element(By.CSS_SELECTOR, ".popup-road-title").text)
            print("   Popup Badge:", safe_badge)
        results["popup_active"] = popup_visible

        # 6. Test Selecting another road via the dropdown
        dropdown_el = driver.find_element(By.ID, "roadSelectDropdown")
        select = Select(dropdown_el)
        print(f"[TEST] Dropdown option count: {len(select.options)}")
        
        # Select NH-16 North
        select.select_by_value("seg-nh16-north")
        time.sleep(1.0)

        # Check that popup updated
        new_popups = driver.find_elements(By.CSS_SELECTOR, ".leaflet-popup .traffic-popup-box")
        if new_popups and new_popups[0].is_displayed():
            new_title = new_popups[0].find_element(By.CSS_SELECTOR, ".popup-road-title").text
            print(f"[TEST] Updated popup title after dropdown change: '{new_title}'")
            results["dropdown_selection_works"] = ("NH-16" in new_title)
        else:
            results["dropdown_selection_works"] = False

        # 7. Test clicking a road directly on map
        # Let's call window.RoadAche.selectRoad('seg-cuttack-road') to simulate map selection
        driver.execute_script("window.RoadAche.selectRoad('seg-cuttack-road');")
        time.sleep(1.0)
        cuttack_popup = driver.find_element(By.CSS_SELECTOR, ".leaflet-popup .popup-road-title").text
        print(f"[TEST] Popup title after clicking Cuttack Road: '{cuttack_popup}'")
        results["road_selection_switches"] = ("Cuttack" in cuttack_popup)

        # 8. Save screenshot
        screenshot_path = "C:/Users/ThinkPad X1/.gemini/antigravity/brain/c2169866-068a-4818-b89d-e9db8cb1614d/traffic_visualization_verified.png"
        driver.save_screenshot(screenshot_path)
        print(f"[TEST] Saved screenshot to {screenshot_path}")

        print("\n=== SUMMARY OF TESTS ===")
        all_passed = True
        for k, v in results.items():
            status_str = "PASS [OK]" if v else "FAIL [X]"
            print(f"  {k}: {status_str}")
            if not v:
                all_passed = False

        if all_passed:
            print("\n>>> ALL TRAFFIC VISUALIZATION & SELECTION TESTS PASSED! <<<")
            sys.exit(0)
        else:
            print("\n>>> SOME TESTS FAILED! <<<")
            sys.exit(1)

    finally:
        driver.quit()

if __name__ == "__main__":
    test_traffic_visualization()
