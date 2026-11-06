# RoadAche 🚦 · AI Road-Safety Radar & Collision Risk Alert System

RoadAche is an autonomous road-safety platform that analyses traffic camera footage using YOLOv8 computer vision, scores collision risk in real time, colors corridors on a Google Maps view (Green / Amber / Red), and alerts municipal road engineers before accidents occur.

Centered on **20.297176° N, 85.866535° E** (Rasulgarh Square / NH-16 junction) covering a **~2.0 km²** area (~1.4 km × 1.4 km).

---

## 🚀 3-Step Quickstart Guide

### Step 1: Open the Project Directory
```powershell
cd "C:\Users\ThinkPad X1\.gemini\antigravity\scratch\roadache"
```

### Step 2: Start the Local HTTP Server
```powershell
python -m http.server 8000
```

### Step 3: Open in Browser
Open your browser and navigate to:
```
http://localhost:8000
```
*(Or press `N` anytime while on the page to trigger the live Near-Miss competition demo!)*

---

## 🗺️ Google Maps Configuration

The map uses standard, unstyled Google Maps (default roadmap view, labels, and appearance).

### Coordinates & Bounding Box
- **Latitude**: `20.297176`
- **Longitude**: `85.866535`
- **Coverage**: ~2.0 km² (~1.414 km × 1.414 km) calculated dynamically via:
  - $dLat = \frac{0.707\text{ km}}{111} \approx 0.00637^\circ$
  - $dLng = \frac{0.707\text{ km}}{111 \times \cos(\text{lat})} \approx 0.00679^\circ$

### Where to Put Your Google Maps API Key
Open [`config.js`](file:///C:/Users/ThinkPad%20X1/.gemini/antigravity/scratch/roadache/config.js):
```javascript
const CONFIG = {
  // Paste your Google Maps API Key here:
  GOOGLE_MAPS_API_KEY: 'AIzaSy...',
  ...
};
```

### How to Get a Free Google Maps API Key
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., "RoadAche").
3. Navigate to **APIs & Services > Library** and enable **Maps JavaScript API**.
4. Go to **APIs & Services > Credentials** and click **Create Credentials > API key**.
5. Copy your key and paste it into `config.js` (`GOOGLE_MAPS_API_KEY`).

*Note: If no API key is provided, RoadAche automatically loads the official Google Maps interactive roadmap embed view without requiring any key.*

---

## 👤 Road Engineer Contact Settings

Change the road engineer contact anytime:
1. Click **"Edit"** on the right pane in the web dashboard.
2. Enter the Name, Mobile Phone, and Email.
3. Click **"Save Contact"** (persists in `localStorage`).

---

## 📁 File Structure

```
roadache/
├── index.html         # Dashboard layout with official Google Maps container
├── style.css          # Dark navy header, modern light cards, responsive grid
├── app.js             # Google Maps controller, AI video sync, alerts & dispatch
├── config.js          # Coordinates (20.297176, 85.866535), API key, thresholds
├── roads.geojson      # 13 road corridors around Rasulgarh Square (NH-16)
├── detect.py          # YOLOv8n tracking, metrics calculation, and JSON exporter
├── detections.json    # Pre-calculated 30-second AI telemetry
├── README.md          # 3-step quickstart and Google Maps setup guide
└── assets/
    ├── footage.mp4    # Traffic camera footage
    └── traffic_real.mp4 # Real-world traffic video sample
```
