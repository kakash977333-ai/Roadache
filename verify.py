import sys
import time
import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def run_tests():
    print("[TEST] Initializing Chrome options for Google Maps test...")
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--window-size=1600,1000")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = webdriver.Chrome(options=chrome_options)
    results = {}

    try:
        print("[TEST] Navigating to http://localhost:8000...")
        driver.get("http://localhost:8000")
        time.sleep(3.0) # Allow Google Maps to load and fitBounds

        # 1. Check Console Logs
        logs = driver.get_log("browser")
        error_logs = [l for l in logs if l["level"] == "SEVERE"]
        print(f"[TEST] Console errors found: {len(error_logs)}")
        if error_logs:
            for l in error_logs:
                print("   Console Log:", l["message"])
        results["no_severe_errors"] = (len(error_logs) == 0)

        # 2. Verify Map Container has rendered Google Maps (Tiles or gm-style)
        map_el = driver.find_element(By.ID, "map")
        gm_elements = map_el.find_elements(By.CLASS_NAME, "gm-style")
        iframe_elements = map_el.find_elements(By.TAG_NAME, "iframe")
        google_tiles = map_el.find_elements(By.CSS_SELECTOR, "img.leaflet-tile")
        map_rendered = (len(gm_elements) > 0 or len(iframe_elements) > 0 or len(google_tiles) > 0)
        print(f"[TEST] Google Maps view loaded in container: {map_rendered} (gm-style: {len(gm_elements)}, tiles: {len(google_tiles)})")
        results["google_map_loaded"] = map_rendered

        # 3. Verify Coordinates and Bounding Box in window.CONFIG
        center_lat = driver.execute_script("return window.CONFIG.CENTER.lat;")
        center_lng = driver.execute_script("return window.CONFIG.CENTER.lng;")
        print(f"[TEST] Configured Center Coordinates: {center_lat}° N, {center_lng}° E")
        coords_match = (abs(center_lat - 20.297176) < 0.0001 and abs(center_lng - 85.866535) < 0.0001)
        results["correct_coordinates"] = coords_match

        # 4. Verify Area Risk Index Gauge
        gauge_val = driver.find_element(By.ID, "gaugeValue").text
        print(f"[TEST] Live Area Risk Index Gauge value: {gauge_val}")
        results["gauge_active"] = (len(gauge_val) > 0 and int(gauge_val) > 0)

        # 5. Test "Simulate Near-Miss" button
        sim_btn = driver.find_element(By.ID, "simulateBtn")
        driver.execute_script("arguments[0].click();", sim_btn)
        time.sleep(1.5)

        banner = driver.find_element(By.ID, "highRiskBanner")
        banner_visible = banner.is_displayed()
        banner_title = driver.find_element(By.ID, "bannerTitle").text
        print(f"[TEST] Simulate Near-Miss banner visible: {banner_visible} ('{banner_title}')")
        results["simulate_banner_triggered"] = banner_visible

        # Check Alert Log entry created
        alert_items = driver.find_elements(By.CLASS_NAME, "alert-item")
        print(f"[TEST] Dispatched Alert Log entries count: {len(alert_items)}")
        results["alert_logged"] = (len(alert_items) > 0)
        if alert_items:
            print("   Top Alert Content:", alert_items[0].text.replace("\n", " | "))

        # 6. Test Road Engineer Contact Edit & localStorage Persistence
        edit_btn = driver.find_element(By.ID, "editContactBtn")
        driver.execute_script("arguments[0].scrollIntoView(true);", edit_btn)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", edit_btn)
        time.sleep(0.5)

        name_input = driver.find_element(By.ID, "inputEngineerName")
        phone_input = driver.find_element(By.ID, "inputEngineerPhone")
        email_input = driver.find_element(By.ID, "inputEngineerEmail")

        name_input.clear()
        name_input.send_keys("Superintending Engineer Debasis Patnaik")
        phone_input.clear()
        phone_input.send_keys("+91 94370 12345")
        email_input.clear()
        email_input.send_keys("debasis.patnaik@works.odisha.gov.in")

        save_btn = driver.find_element(By.CSS_SELECTOR, "#contactEditForm button[type='submit']")
        driver.execute_script("arguments[0].click();", save_btn)
        time.sleep(0.5)

        disp_name = driver.find_element(By.ID, "displayEngineerName").text
        print(f"[TEST] Contact updated display name: '{disp_name}'")
        results["contact_updated"] = ("Debasis Patnaik" in disp_name)

        # Refresh page to test persistence across reload
        print("[TEST] Reloading page to test persistence...")
        driver.refresh()
        time.sleep(2.5)

        reloaded_name = driver.find_element(By.ID, "displayEngineerName").text
        print(f"[TEST] After reload display name: '{reloaded_name}'")
        results["contact_persisted_after_reload"] = ("Debasis Patnaik" in reloaded_name)

        # Save Screenshot
        screenshot_path = "C:/Users/ThinkPad X1/.gemini/antigravity/scratch/roadache/google_maps_verified.png"
        driver.save_screenshot(screenshot_path)
        print(f"[TEST] Saved verification screenshot to {screenshot_path}")

        print("\n=== TEST RESULTS SUMMARY ===")
        all_passed = True
        for k, v in results.items():
            print(f"  {k}: {'PASS [OK]' if v else 'FAIL [X]'}")
            if not v:
                all_passed = False

        if all_passed:
            print("\n>>> ALL GOOGLE MAPS QUALITY BAR CHECKS PASSED SUCCESSFULLY! <<<")
            sys.exit(0)
        else:
            print("\n>>> SOME CHECKS FAILED! <<<")
            sys.exit(1)

    finally:
        driver.quit()

if __name__ == "__main__":
    run_tests()
