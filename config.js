/**
 * RoadAche - System Configuration
 * Live road-safety risk monitoring & alert dispatching
 */

const CONFIG = {
  // Center of monitoring area: 20.297176° N, 85.866535° E (Rasulgarh Square / Cuttack Road)
  CENTER: {
    lat: 20.297176,
    lng: 85.866535
  },

  // Monitored area: ~2.0 km² (~1.414 km x 1.414 km square around center)
  AREA_KM2: 2,

  // Google Maps Roadmap Base Tile Settings
  MAP: {
    minZoom: 14,
    maxZoom: 19,
    initialZoom: 16,
    // Official Google Maps Roadmap tile server (default Google appearance):
    tileUrl: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    tileAttribution: 'Map data &copy; <a href="https://www.google.com/maps" target="_blank">Google</a>'
  },

  // Junction Camera configuration at Rasulgarh Square
  CAMERA: {
    id: 'cam-01',
    name: 'Camera 01 · Rasulgarh Square (NH-16 & Cuttack Rd)',
    lat: 20.297176,
    lng: 85.866535,
    fovAngleDeg: 58,
    fovDirectionDeg: 0, // 0 deg = North
    fovLengthMeters: 140
  },

  // 4 Junction arms pairing video quadrants to map road segments
  JUNCTION_ARMS: {
    north: {
      segmentId: 'seg-nh16-north',
      name: 'NH-16 (North Arm · NB to Palasuni/Cuttack)',
      zone: 'top',
      label: 'North (Top)'
    },
    south: {
      segmentId: 'seg-nh16-south',
      name: 'NH-16 (South Arm · SB to Vani Vihar)',
      zone: 'bottom',
      label: 'South (Bottom)'
    },
    west: {
      segmentId: 'seg-saheed-west',
      name: 'Saheed Nagar / Bomikhal (West Arm)',
      zone: 'left',
      label: 'West (Left)'
    },
    east: {
      segmentId: 'seg-cuttack-road',
      name: 'Cuttack Road (East/South Arm · Heavy Congestion)',
      zone: 'right',
      label: 'East (Right)'
    }
  },

  // Primary Camera segment ID (for camera focus)
  CAMERA_SEGMENT_ID: 'seg-nh16-north',

  // Risk Score Thresholds & Colors (matching legend)
  THRESHOLDS: {
    LOW: 40,      // < 40 = Green (Low Risk / Free Flow)
    MEDIUM: 70,   // 40 - 70 = Orange/Amber (Medium Risk)
    HIGH: 70      // >= 70 = Red (High Risk · Critical)
  },

  COLORS: {
    LOW: '#22C55E',       // Green (Low / Free flow)
    MEDIUM: '#F59E0B',    // Orange / Amber (Medium 40-70)
    HIGH: '#EF4444',      // Red (High Risk >=70 · Critical)
    SELECTED: '#2563EB',  // Blue selection highlight halo
    NAVY: '#0B1020',
    CRIMSON: '#E11D48'
  },

  // Simulation & Update Cycle
  UPDATE_MS: 3000,
  ALERT_COOLDOWN_MS: 30000, // 30s alert cooldown per segment
  SIMULATE_NEAR_MISS_DURATION_MS: 20000, // 20s forced red on Simulate button

  // Default Road Engineer Contact Info (persisted in localStorage)
  DEFAULT_ENGINEER: {
    name: 'Alex Vance, P.E.',
    phone: '+1 (212) 555-0199',
    email: 'alex.vance@dot.gov'
  }
};

// Export to window for vanilla JS
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
