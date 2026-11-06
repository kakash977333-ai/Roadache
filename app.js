/**
 * RoadAche - Main Application Logic
 * Google Maps Roadmap with Fake / Assumed Traffic Risk Visualization
 * Rasulgarh Square & Cuttack Road Area (Bhubaneswar, Odisha)
 */

(function () {
  'use strict';

  // ==========================================================================
  // Application State
  // ==========================================================================
  const state = {
    map: null,
    roadsData: null,
    roadLayers: {}, // segmentId -> { polyline, halo, feature, currentScore, rootCause, lastUpdated }
    selectedSegmentId: null,
    selectionHalo: null,
    cameraMarker: null,
    cameraFovPolygon: null,
    detections: null,
    isSimulated: false,
    audioEnabled: true,
    audioCtx: null,

    // Timing & animation
    currentVideoTime: 0,
    videoDuration: 30,
    activeFrameIndex: 0,
    animFrameId: null,
    simulationTimerId: null,

    // Near-Miss Simulation override
    simulateNearMissActive: false,
    simulateNearMissTimer: null,
    simulateNearMissArm: 'north',

    // Alerts & dispatch
    alerts: [],
    alertCooldowns: {}, // segmentId -> timestamp ms

    // Road engineer contact info
    engineer: { ...CONFIG.DEFAULT_ENGINEER }
  };

  // ==========================================================================
  // DOM Elements Cache
  // ==========================================================================
  const dom = {
    // Header
    clock: document.getElementById('liveClock'),
    audioToggleBtn: document.getElementById('audioToggleBtn'),
    audioIcon: document.getElementById('audioIcon'),
    audioText: document.getElementById('audioText'),
    simulateBtn: document.getElementById('simulateBtn'),
    camHeaderLabel: document.getElementById('camHeaderLabel'),

    // Critical Banner
    highRiskBanner: document.getElementById('highRiskBanner'),
    bannerTitle: document.getElementById('bannerTitle'),
    bannerDetails: document.getElementById('bannerDetails'),
    bannerViewBtn: document.getElementById('bannerViewBtn'),
    bannerDispatchBtn: document.getElementById('bannerDispatchBtn'),
    bannerDismissBtn: document.getElementById('bannerDismissBtn'),

    // Video & Overlay
    videoWrapper: document.getElementById('videoWrapper'),
    video: document.getElementById('trafficVideo'),
    canvas: document.getElementById('overlayCanvas'),
    modelBadge: document.getElementById('modelBadge'),
    simulatedBadge: document.getElementById('simulatedBadge'),
    videoTimeChip: document.getElementById('videoTimeChip'),
    videoFpsChip: document.getElementById('videoFpsChip'),

    // Zone Pills on Video
    zoneValTop: document.getElementById('zoneValTop'),
    zoneValBottom: document.getElementById('zoneValBottom'),
    zoneValLeft: document.getElementById('zoneValLeft'),
    zoneValRight: document.getElementById('zoneValRight'),

    // Arm Status Cards
    armCards: {
      north: document.getElementById('armCardNorth'),
      south: document.getElementById('armCardSouth'),
      west: document.getElementById('armCardWest'),
      east: document.getElementById('armCardEast')
    },
    armScores: {
      north: document.getElementById('armScoreNorth'),
      south: document.getElementById('armScoreSouth'),
      west: document.getElementById('armScoreWest'),
      east: document.getElementById('armScoreEast')
    },
    armStatuses: {
      north: document.getElementById('armStatusNorth'),
      south: document.getElementById('armStatusSouth'),
      west: document.getElementById('armStatusWest'),
      east: document.getElementById('armStatusEast')
    },

    // AI Telemetry Stats
    statVehicles: document.getElementById('statVehicles'),
    statNearMisses: document.getElementById('statNearMisses'),
    statCameraRisk: document.getElementById('statCameraRisk'),
    statSpeedDrops: document.getElementById('statSpeedDrops'),
    statMinGapText: document.getElementById('statMinGapText'),
    gapProgressBar: document.getElementById('gapProgressBar'),
    telemetryState: document.getElementById('telemetryState'),

    // Map Controls & Selector
    recenterBtn: document.getElementById('recenterBtn'),
    focusCamBtn: document.getElementById('focusCamBtn'),
    roadSelectDropdown: document.getElementById('roadSelectDropdown'),

    // Area Risk Gauge
    gaugeValue: document.getElementById('gaugeValue'),
    gaugeProgressArc: document.getElementById('gaugeProgressArc'),
    gaugeNeedle: document.getElementById('gaugeNeedle'),
    areaRiskSummaryTag: document.getElementById('areaRiskSummaryTag'),
    countGreen: document.getElementById('countGreen'),
    countAmber: document.getElementById('countAmber'),
    countRed: document.getElementById('countRed'),

    // Alert Log
    alertsList: document.getElementById('alertsList'),
    alertCountBadge: document.getElementById('alertCountBadge'),
    clearLogsBtn: document.getElementById('clearLogsBtn'),
    alertsEmptyState: document.getElementById('alertsEmptyState'),

    // Engineer Contact
    displayEngineerName: document.getElementById('displayEngineerName'),
    displayEngineerPhone: document.getElementById('displayEngineerPhone'),
    displayEngineerEmail: document.getElementById('displayEngineerEmail'),
    quickSmsLink: document.getElementById('quickSmsLink'),
    quickEmailLink: document.getElementById('quickEmailLink'),
    contactDisplayView: document.getElementById('contactDisplayView'),
    contactEditForm: document.getElementById('contactEditForm'),
    editContactBtn: document.getElementById('editContactBtn'),
    cancelContactBtn: document.getElementById('cancelContactBtn'),
    inputEngineerName: document.getElementById('inputEngineerName'),
    inputEngineerPhone: document.getElementById('inputEngineerPhone'),
    inputEngineerEmail: document.getElementById('inputEngineerEmail'),
    contactFormError: document.getElementById('contactFormError'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  // ==========================================================================
  // Initialization Routine
  // ==========================================================================
  async function init() {
    loadEngineerContact();
    startClock();
    initAudio();
    initGoogleRoadmapView();
    setupEventListeners();

    // Load data assets
    await loadRoadsGeoJSON();
    await loadDetectionsData();

    // Start video & overlay tracking loop
    setupVideoOverlay();

    // Start 3-second simulation random walk
    startSimulationCycle();

    // Check deep link hash (#segment=ID)
    handleUrlHash();
  }

  // ==========================================================================
  // Clock & Timing
  // ==========================================================================
  function startClock() {
    function update() {
      const now = new Date();
      if (dom.clock) {
        dom.clock.textContent = now.toTimeString().split(' ')[0];
      }
    }
    update();
    setInterval(update, 1000);
  }

  // ==========================================================================
  // Web Audio Alert Sound (Offline Synthetic Beep)
  // ==========================================================================
  function initAudio() {
    dom.audioToggleBtn.addEventListener('click', () => {
      state.audioEnabled = !state.audioEnabled;
      dom.audioIcon.textContent = state.audioEnabled ? '🔊' : '🔇';
      dom.audioText.textContent = state.audioEnabled ? 'Audio On' : 'Muted';
      showToast(state.audioEnabled ? 'Audio alerts enabled' : 'Audio alerts muted', 'neutral');
    });
  }

  function playAlertBeep() {
    if (!state.audioEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!state.audioCtx) {
        state.audioCtx = new AudioCtx();
      }
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }

      const ctx = state.audioCtx;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(660, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio playback error (handled):', e);
    }
  }

  // ==========================================================================
  // Google Maps Base View Initialization (Using Official Google Roadmap Tiles)
  // ==========================================================================
  function initGoogleRoadmapView() {
    const center = [CONFIG.CENTER.lat, CONFIG.CENTER.lng];

    // Calculate dynamic 2.0 km² bounding box:
    // Side ≈ 1.414 km -> Half-side ≈ 0.707 km
    const sideKm = Math.sqrt(CONFIG.AREA_KM2 || 2);
    const halfSideKm = sideKm / 2;
    const dLat = halfSideKm / 111;
    const latRad = (CONFIG.CENTER.lat * Math.PI) / 180;
    const dLng = halfSideKm / (111 * Math.cos(latRad));

    const southWest = [CONFIG.CENTER.lat - dLat, CONFIG.CENTER.lng - dLng];
    const northEast = [CONFIG.CENTER.lat + dLat, CONFIG.CENTER.lng + dLng];
    const bounds = L.latLngBounds(southWest, northEast);

    // Initialize Leaflet Map with Google Maps Roadmap Tiles
    state.map = L.map('map', {
      center: center,
      zoom: CONFIG.MAP.initialZoom || 16,
      minZoom: CONFIG.MAP.minZoom || 14,
      maxZoom: CONFIG.MAP.maxZoom || 19,
      maxBounds: bounds.pad(0.4),
      zoomControl: true,
      attributionControl: true
    });

    // Fit map precisely to the 2 km² bounding box
    state.map.fitBounds(bounds);

    // Official Google Maps Roadmap Tiles (Default unstyled Google look, labels, POIs, standard road colors)
    L.tileLayer(CONFIG.MAP.tileUrl, {
      subdomains: CONFIG.MAP.subdomains || ['0', '1', '2', '3'],
      maxZoom: CONFIG.MAP.maxZoom || 19,
      attribution: CONFIG.MAP.tileAttribution
    }).addTo(state.map);

    // Camera Marker at Rasulgarh Square with North FOV Cone
    createCameraMarker(center);
  }

  function createCameraMarker(latLng) {
    const lat = latLng[0];
    const lng = latLng[1];
    const fovLenLat = 0.0013;
    const fovHalfWidthLng = 0.0011;

    const fovCoords = [
      [lat, lng],
      [lat + fovLenLat, lng - fovHalfWidthLng],
      [lat + fovLenLat * 1.05, lng],
      [lat + fovLenLat, lng + fovHalfWidthLng],
      [lat, lng]
    ];

    state.cameraFovPolygon = L.polygon(fovCoords, {
      color: '#E11D48',
      fillColor: '#E11D48',
      fillOpacity: 0.18,
      weight: 1.5,
      dashArray: '4, 4'
    }).addTo(state.map);

    state.cameraFovPolygon.bindTooltip('FOV: Camera 01 (Northbound View)', {
      sticky: true,
      direction: 'top'
    });

    // Camera Icon DivIcon
    const cameraIconHtml = `
      <div style="
        position: relative;
        width: 34px;
        height: 34px;
        background: #0B1020;
        border: 2px solid #E11D48;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(225, 29, 72, 0.45);
        cursor: pointer;
      ">
        <span style="font-size: 16px; line-height: 1;">📹</span>
        <span style="
          position: absolute;
          top: -2px;
          right: -2px;
          width: 9px;
          height: 9px;
          background: #22C55E;
          border: 1.5px solid #0B1020;
          border-radius: 50%;
          animation: dotPulse 1.6s infinite;
        "></span>
      </div>
    `;

    const camIcon = L.divIcon({
      html: cameraIconHtml,
      className: 'camera-junction-marker',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18]
    });

    state.cameraMarker = L.marker(latLng, { icon: camIcon, zIndexOffset: 1000 }).addTo(state.map);

    const popupHtml = `
      <div class="traffic-popup-box">
        <div class="map-popup-header">
          <div class="map-popup-title">${CONFIG.CAMERA.name}</div>
          <span class="badge badge-primary">LIVE RADAR</span>
        </div>
        <div class="popup-info-grid">
          <div class="popup-info-row">
            <strong>Intersection:</strong>
            <span>Rasulgarh Square (4-Way)</span>
          </div>
          <div class="popup-info-row">
            <strong>Coordinates:</strong>
            <span>20.297176° N, 85.866535° E</span>
          </div>
          <div class="popup-info-row">
            <strong>Coverage:</strong>
            <span>Cuttack Rd, NH-16 NB/SB, Saheed Nagar</span>
          </div>
          <div class="popup-info-row">
            <strong>Primary Traffic Arm:</strong>
            <span style="color:#EF4444; font-weight:700;">Cuttack Road (High Risk)</span>
          </div>
        </div>
        <div style="margin-top: 8px;">
          <button onclick="window.RoadAche.focusVideoFeed()" class="btn btn-xs btn-crimson" style="width: 100%;">
            Focus Camera Feed
          </button>
        </div>
      </div>
    `;

    state.cameraMarker.bindPopup(popupHtml);

    state.cameraMarker.on('click', () => {
      highlightVideoCard();
    });
  }

  // ==========================================================================
  // Load & Render Roads GeoJSON with Fake Traffic Visualization
  // ==========================================================================
  async function loadRoadsGeoJSON() {
    try {
      const resp = await fetch('roads.geojson');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      state.roadsData = await resp.json();
    } catch (err) {
      console.warn('Could not fetch roads.geojson:', err);
    }

    renderRoadSegments();
  }

  function renderRoadSegments() {
    if (!state.roadsData || !state.roadsData.features) return;

    // Reset dropdown options
    if (dom.roadSelectDropdown) {
      dom.roadSelectDropdown.innerHTML = '<option value="">-- Click a road on map or select here --</option>';
    }

    state.roadsData.features.forEach((feature) => {
      const props = feature.properties || {};
      const id = props.id || `seg-${Math.random().toString(36).substr(2, 6)}`;
      const baseRisk = Number(props.baseRisk) || 28;
      const initialScore = baseRisk;
      const coords = feature.geometry.coordinates.map(pt => [pt[1], pt[0]]); // [lng, lat] -> [lat, lng]

      const isArm = !!props.arm;
      const color = getRiskColor(initialScore);

      // 1. Base Casing / Glow Line (gives contrast against Google Maps roadmap)
      const casing = L.polyline(coords, {
        color: '#FFFFFF',
        weight: isArm ? 11 : 9,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.map);

      // 2. Main Traffic Polyline (Colored by assumed traffic: Orange/Amber or Red or Green)
      const polyline = L.polyline(coords, {
        color: color,
        weight: isArm ? 8 : 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(state.map);

      // Apply pulsing CSS if initial risk is High
      if (initialScore >= CONFIG.THRESHOLDS.HIGH) {
        const pathEl = polyline.getElement();
        if (pathEl) pathEl.classList.add('road-pulse');
      }

      // Save to state
      state.roadLayers[id] = {
        feature: feature,
        polyline: polyline,
        casing: casing,
        coords: coords,
        currentScore: initialScore,
        lastUpdated: new Date(),
        rootCause: props.rootCause || 'Traffic density',
        trafficLevel: props.trafficLevel || (initialScore >= 70 ? 'High Risk' : (initialScore >= 40 ? 'Medium Risk' : 'Low Risk')),
        speed: props.speed || '25 km/h',
        isArm: isArm,
        arm: props.arm || null,
        zone: props.zone || null,
        name: props.name || id
      };

      // Tooltip on Hover
      polyline.bindTooltip(`<strong>${props.name}</strong><br><span style="color:${color}; font-weight:700;">${getRiskLabel(initialScore)} (${initialScore}/100)</span>`, {
        sticky: true,
        direction: 'top'
      });

      // Bind Rich Popup
      polyline.bindPopup(() => createSegmentPopupContent(id), {
        maxWidth: 320
      });

      // Click to Select Road
      polyline.on('click', () => {
        selectRoad(id);
      });
      casing.on('click', () => {
        selectRoad(id);
      });

      // Hover feedback
      polyline.on('mouseover', () => {
        if (state.selectedSegmentId !== id) {
          polyline.setStyle({ weight: isArm ? 11 : 9, opacity: 1 });
          casing.setStyle({ weight: isArm ? 14 : 12 });
        }
      });
      polyline.on('mouseout', () => {
        if (state.selectedSegmentId !== id) {
          polyline.setStyle({ weight: isArm ? 8 : 6, opacity: 0.95 });
          casing.setStyle({ weight: isArm ? 11 : 9 });
        }
      });

      // Add to Select Dropdown
      if (dom.roadSelectDropdown) {
        const opt = document.createElement('option');
        opt.value = id;
        const riskTag = initialScore >= 70 ? '🔴 High Risk' : (initialScore >= 40 ? '🟠 Medium' : '🟢 Free Flow');
        opt.textContent = `${props.name} · ${riskTag} (${initialScore})`;
        dom.roadSelectDropdown.appendChild(opt);
      }
    });

    updateAreaRiskIndex();

    // Select Cuttack Road by default so user immediately sees an active selection
    setTimeout(() => {
      selectRoad('seg-cuttack-road');
    }, 600);
  }

  // ==========================================================================
  // Road Selection & Traffic Highlight Handler
  // ==========================================================================
  function selectRoad(segmentId) {
    const road = state.roadLayers[segmentId];
    if (!road) return;

    state.selectedSegmentId = segmentId;

    // Remove existing selection halo
    if (state.selectionHalo) {
      state.map.removeLayer(state.selectionHalo);
      state.selectionHalo = null;
    }

    // Reset styles on all other roads
    Object.keys(state.roadLayers).forEach((k) => {
      const r = state.roadLayers[k];
      const isArm = r.isArm;
      r.polyline.setStyle({
        weight: isArm ? 8 : 6,
        opacity: 0.95
      });
      r.casing.setStyle({
        color: '#FFFFFF',
        weight: isArm ? 11 : 9
      });
    });

    // Create a prominent blue/cyan selection halo under the selected road
    state.selectionHalo = L.polyline(road.coords, {
      color: '#2563EB',
      weight: 16,
      opacity: 0.7,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'road-selected-halo'
    }).addTo(state.map);

    // Bring selected road and halo to front
    state.selectionHalo.bringToFront();
    road.casing.bringToFront();
    road.polyline.bringToFront();

    // Set highlighted road polyline style
    road.casing.setStyle({ color: '#1E3A8A', weight: 13 });
    road.polyline.setStyle({ weight: 9, opacity: 1.0 });

    // Open popup
    road.polyline.openPopup();

    // Sync dropdown
    if (dom.roadSelectDropdown && dom.roadSelectDropdown.value !== segmentId) {
      dom.roadSelectDropdown.value = segmentId;
    }

    // Pan map to center of selected road
    const bounds = road.polyline.getBounds();
    state.map.panTo(bounds.getCenter(), { animate: true, duration: 0.5 });

    if (road.isArm) {
      highlightVideoCard();
    }
  }

  function getRiskColor(score) {
    if (score < CONFIG.THRESHOLDS.LOW) return CONFIG.COLORS.LOW;     // Green (#22C55E)
    if (score < CONFIG.THRESHOLDS.HIGH) return CONFIG.COLORS.MEDIUM;  // Orange/Amber (#F59E0B)
    return CONFIG.COLORS.HIGH;                                       // Red (#EF4444)
  }

  function getRiskLabel(score) {
    if (score < CONFIG.THRESHOLDS.LOW) return 'LOW RISK (Free Flow)';
    if (score < CONFIG.THRESHOLDS.HIGH) return 'MEDIUM RISK (Orange/Amber)';
    return 'HIGH RISK (Critical Red)';
  }

  function createSegmentPopupContent(segmentId) {
    const data = state.roadLayers[segmentId];
    if (!data) return 'Corridor information unavailable';

    const score = Math.round(data.currentScore);
    const color = getRiskColor(score);
    const badgeClass = score >= CONFIG.THRESHOLDS.HIGH ? 'badge-high' : (score >= CONFIG.THRESHOLDS.LOW ? 'badge-medium' : 'badge-low');
    const badgeText = score >= CONFIG.THRESHOLDS.HIGH ? '⚠️ HIGH RISK (CRITICAL)' : (score >= CONFIG.THRESHOLDS.LOW ? '🟠 MEDIUM RISK' : '🟢 LOW RISK (FREE FLOW)');
    const timeAgo = Math.max(1, Math.round((Date.now() - data.lastUpdated.getTime()) / 1000));

    return `
      <div class="traffic-popup-box">
        <div class="popup-road-title">${data.name}</div>
        <div class="popup-traffic-badge ${badgeClass}">${badgeText} · Score: ${score}/100</div>
        
        <div class="popup-info-grid">
          <div class="popup-info-row">
            <strong>Assumed Traffic:</strong>
            <span style="color:${color};">${data.trafficLevel}</span>
          </div>
          <div class="popup-info-row">
            <strong>Estimated Speed:</strong>
            <span>${data.speed} (Slow Flow)</span>
          </div>
          <div class="popup-info-row">
            <strong>Bottleneck Cause:</strong>
            <span style="max-width: 175px; text-align: right;">${data.rootCause}</span>
          </div>
          <div class="popup-info-row">
            <strong>Road Type:</strong>
            <span>${data.feature.properties.highway || 'Primary'} (${data.feature.properties.lanes || 4} Lanes)</span>
          </div>
          <div class="popup-info-row">
            <strong>Speed Limit:</strong>
            <span>${data.feature.properties.speedLimit || '40 km/h'}</span>
          </div>
          <div class="popup-info-row">
            <strong>Last Updated:</strong>
            <span>${timeAgo}s ago</span>
          </div>
        </div>

        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:10px; color:#2563EB; font-weight:700;">✓ CURRENTLY SELECTED</span>
          <button onclick="window.RoadAche.selectRoad('${segmentId}')" class="btn btn-xs btn-outline">Center</button>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // Detections Data Loading
  // ==========================================================================
  async function loadDetectionsData() {
    try {
      const resp = await fetch('detections.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      state.detections = await resp.json();
      state.isSimulated = !!(state.detections.metadata && state.detections.metadata.is_simulated);
      if (state.detections.metadata && state.detections.metadata.duration_sec) {
        state.videoDuration = state.detections.metadata.duration_sec;
      }
    } catch (e) {
      console.warn('Could not load detections.json, using runtime simulation:', e);
      state.detections = generateRuntimeFallbackDetections();
      state.isSimulated = true;
    }

    if (state.isSimulated && dom.simulatedBadge) {
      dom.simulatedBadge.classList.remove('hidden');
    }
  }

  // ==========================================================================
  // Video & Canvas Tracking Overlay
  // ==========================================================================
  function setupVideoOverlay() {
    const video = dom.video;
    const canvas = dom.canvas;
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      const rect = dom.videoWrapper.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    let fallbackTime = 0;
    let videoIsPlaying = false;

    video.addEventListener('playing', () => { videoIsPlaying = true; });
    video.addEventListener('pause', () => { videoIsPlaying = false; });
    video.addEventListener('error', (e) => {
      console.warn('Video element error, running synthetic canvas:', e);
      videoIsPlaying = false;
    });

    video.play().catch(() => {
      console.log('Autoplay deferred, canvas fallback active.');
    });

    let lastRenderTime = performance.now();

    function renderLoop(now) {
      state.animFrameId = requestAnimationFrame(renderLoop);
      const dt = (now - lastRenderTime) / 1000;
      lastRenderTime = now;

      let currentTime = 0;
      if (videoIsPlaying && !video.paused && video.duration) {
        currentTime = video.currentTime;
      } else {
        fallbackTime = (fallbackTime + dt) % (state.videoDuration || 30);
        currentTime = fallbackTime;
      }
      state.currentVideoTime = currentTime;

      const rect = dom.videoWrapper.getBoundingClientRect();
      const displayW = rect.width;
      const displayH = rect.height;

      ctx.clearRect(0, 0, displayW, displayH);

      if (!videoIsPlaying || video.readyState < 2) {
        drawSyntheticTrafficBackground(ctx, displayW, displayH, currentTime);
      }

      drawQuadrantDivisions(ctx, displayW, displayH);
      renderFrameDetections(ctx, displayW, displayH, currentTime);

      const mins = Math.floor(currentTime / 60).toString().padStart(2, '0');
      const secs = (currentTime % 60).toFixed(2).padStart(5, '0');
      if (dom.videoTimeChip) dom.videoTimeChip.textContent = `${mins}:${secs}`;
    }

    state.animFrameId = requestAnimationFrame(renderLoop);
  }

  function drawSyntheticTrafficBackground(ctx, w, h, t) {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);

    const roadW = Math.min(w * 0.32, 130);
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, cy - roadW / 2, w, roadW);
    ctx.fillRect(cx - roadW / 2, 0, roadW, h);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    const stripeW = 6;
    for (let x = cx - roadW / 2; x < cx + roadW / 2; x += 14) {
      ctx.fillRect(x, cy - roadW / 2 - 12, stripeW, 8);
      ctx.fillRect(x, cy + roadW / 2 + 4, stripeW, 8);
    }
    for (let y = cy - roadW / 2; y < cy + roadW / 2; y += 14) {
      ctx.fillRect(cx - roadW / 2 - 12, y, 8, stripeW);
      ctx.fillRect(cx + roadW / 2 + 4, y, 8, stripeW);
    }

    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(cx - roadW / 2, cy);
    ctx.moveTo(cx + roadW / 2, cy); ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, cy - roadW / 2);
    ctx.moveTo(cx, cy + roadW / 2); ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawQuadrantDivisions(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w, h);
    ctx.moveTo(w, 0); ctx.lineTo(0, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.4)';
    ctx.stroke();

    ctx.restore();
  }

  function renderFrameDetections(ctx, displayW, displayH, currentTime) {
    if (!state.detections || !state.detections.frames) return;

    const frames = state.detections.frames;
    const baseW = (state.detections.metadata && state.detections.metadata.frame_width) || 640;
    const baseH = (state.detections.metadata && state.detections.metadata.frame_height) || 360;

    const scaleX = displayW / baseW;
    const scaleY = displayH / baseH;

    const frame = findClosestFrame(frames, currentTime);
    if (!frame) return;

    let vehs = frame.vehicles || [];

    if (state.simulateNearMissActive) {
      vehs = injectSimulatedConflict(vehs, baseW, baseH);
    }

    vehs.forEach((v) => {
      const box = v.bbox;
      const x1 = box[0] * scaleX;
      const y1 = box[1] * scaleY;
      const x2 = box[2] * scaleX;
      const y2 = box[3] * scaleY;
      const bw = x2 - x1;
      const bh = y2 - y1;

      const isConflict = !!v.conflict;
      const strokeColor = isConflict ? '#EF4444' : '#38BDF8';
      const bgColor = isConflict ? 'rgba(239, 68, 68, 0.22)' : 'rgba(56, 189, 248, 0.12)';

      ctx.fillStyle = bgColor;
      ctx.fillRect(x1, y1, bw, bh);

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isConflict ? 2.5 : 1.5;
      ctx.strokeRect(x1, y1, bw, bh);

      const cl = Math.min(6, bw / 4, bh / 4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1 + cl); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cl, y1);
      ctx.moveTo(x2 - cl, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2 + cl, y1);
      ctx.moveTo(x1, y2 - cl); ctx.lineTo(x1, y2); ctx.lineTo(x1 + cl, y2);
      ctx.moveTo(x2 - cl, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2 - cl, y2);
      ctx.stroke();

      const labelText = isConflict
        ? `⚠️ ID:${v.id} ${v.class.toUpperCase()} CONFLICT`
        : `#${v.id} ${v.class} ${v.conf ? Math.round(v.conf * 100) + '%' : ''}`;

      ctx.font = '600 10px Inter, system-ui, sans-serif';
      const textWidth = ctx.measureText(labelText).width;
      const tagH = 15;
      const tagY = Math.max(0, y1 - tagH - 2);

      ctx.fillStyle = isConflict ? '#EF4444' : '#0B1020';
      ctx.fillRect(x1, tagY, textWidth + 8, tagH);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(labelText, x1 + 4, tagY + 11);
    });
  }

  function findClosestFrame(frames, t) {
    if (!frames || frames.length === 0) return null;
    let low = 0;
    let high = frames.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (Math.abs(frames[mid].t - t) < 0.08) {
        return frames[mid];
      }
      if (frames[mid].t < t) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return frames[Math.min(frames.length - 1, Math.max(0, low))];
  }

  function injectSimulatedConflict(vehs, bw, bh) {
    const res = vehs.map(v => ({ ...v }));
    const cx = bw / 2;
    const topY = bh * 0.28;

    res.push({
      id: 991,
      class: 'car',
      bbox: [cx - 28, topY, cx + 8, topY + 44],
      zone: 'top',
      conf: 0.94,
      conflict: true,
      sudden_drop: true
    });

    res.push({
      id: 992,
      class: 'truck',
      bbox: [cx - 10, topY + 12, cx + 32, topY + 68],
      zone: 'top',
      conf: 0.96,
      conflict: true,
      sudden_drop: true
    });

    return res;
  }

  // ==========================================================================
  // Simulation & 3-Second Update Cycle
  // ==========================================================================
  function startSimulationCycle() {
    updateAllCorridorRisks();
    state.simulationTimerId = setInterval(updateAllCorridorRisks, CONFIG.UPDATE_MS);
  }

  function updateAllCorridorRisks() {
    const currentSec = Math.floor(state.currentVideoTime);
    let secSummary = null;

    if (state.detections && state.detections.seconds_summary) {
      const summaries = state.detections.seconds_summary;
      secSummary = summaries[currentSec % summaries.length];
    }

    const zoneMetrics = extractZoneMetrics(secSummary);
    updateTelemetryStats(secSummary, zoneMetrics);

    Object.keys(state.roadLayers).forEach((segId) => {
      const road = state.roadLayers[segId];

      if (road.isArm) {
        const zMetric = zoneMetrics[road.arm];
        let armScore = zMetric ? (zMetric.risk_score || zMetric.risk || 40) : 40;
        if (state.simulateNearMissActive && road.arm === state.simulateNearMissArm) {
          armScore = 94;
          road.rootCause = 'CRITICAL near-miss trajectory conflict · Sudden deceleration';
        }
        road.currentScore = armScore;
        road.lastUpdated = new Date();
      } else {
        const base = road.feature.properties.baseRisk || 35;
        const walk = (Math.sin(Date.now() / 7000 + segId.charCodeAt(segId.length - 1)) * 10) + (Math.random() * 4 - 2);
        const newScore = Math.max(10, Math.min(95, Math.round(base + walk)));
        road.currentScore = newScore;
        road.lastUpdated = new Date();
      }

      applyPolylineStyle(road);

      if (road.currentScore >= CONFIG.THRESHOLDS.HIGH) {
        triggerHighRiskAlert(road);
      }
    });

    updateArmCards(zoneMetrics);
    updateAreaRiskIndex();
  }

  function extractZoneMetrics(secSummary) {
    if (secSummary && secSummary.zones) {
      return {
        north: secSummary.zones.top || { risk_score: 64, vehicle_count: 3 },
        south: secSummary.zones.bottom || { risk_score: 58, vehicle_count: 3 },
        west: secSummary.zones.left || { risk_score: 78, vehicle_count: 4 },
        east: secSummary.zones.right || { risk_score: 82, vehicle_count: 5 }
      };
    }

    return {
      north: { risk_score: 64, vehicle_count: 3 },
      south: { risk_score: 58, vehicle_count: 3 },
      west: { risk_score: 78, vehicle_count: 4 },
      east: { risk_score: 82, vehicle_count: 5 }
    };
  }

  function updateTelemetryStats(secSummary, zoneMetrics) {
    const totalVehicles = secSummary ? secSummary.vehicle_count : (state.simulateNearMissActive ? 14 : 9);
    const nearMisses = state.simulateNearMissActive ? 3 : (secSummary ? secSummary.near_misses : 1);
    const speedDrops = state.simulateNearMissActive ? 2 : (secSummary ? secSummary.speed_drops : 1);
    const minGap = state.simulateNearMissActive ? '16.4 px' : (secSummary ? `${secSummary.min_gap_px} px` : '28.0 px');
    const camRisk = state.simulateNearMissActive ? 94 : 76;

    if (dom.statVehicles) dom.statVehicles.textContent = totalVehicles;
    if (dom.statNearMisses) {
      dom.statNearMisses.textContent = nearMisses;
      dom.statNearMisses.className = `stat-value ${nearMisses > 0 ? 'text-red' : 'text-amber'}`;
    }
    if (dom.statCameraRisk) {
      dom.statCameraRisk.textContent = camRisk;
      dom.statCameraRisk.className = `stat-value ${camRisk >= 70 ? 'text-red' : (camRisk >= 40 ? 'text-amber' : 'text-green')}`;
    }
    if (dom.statSpeedDrops) dom.statSpeedDrops.textContent = speedDrops;
    if (dom.statMinGapText) dom.statMinGapText.textContent = minGap;

    if (dom.gapProgressBar) {
      const gapVal = parseFloat(minGap) || 35;
      const pct = Math.min(100, Math.max(10, (gapVal / 120) * 100));
      dom.gapProgressBar.style.width = `${pct}%`;
      dom.gapProgressBar.style.backgroundColor = gapVal < 30 ? CONFIG.COLORS.HIGH : (gapVal < 60 ? CONFIG.COLORS.MEDIUM : CONFIG.COLORS.LOW);
    }

    if (dom.zoneValTop) dom.zoneValTop.textContent = state.simulateNearMissActive ? '94' : `${zoneMetrics.north.risk_score}`;
    if (dom.zoneValBottom) dom.zoneValBottom.textContent = `${zoneMetrics.south.risk_score}`;
    if (dom.zoneValLeft) dom.zoneValLeft.textContent = `${zoneMetrics.west.risk_score}`;
    if (dom.zoneValRight) dom.zoneValRight.textContent = `${zoneMetrics.east.risk_score}`;
  }

  function updateArmCards(zoneMetrics) {
    const arms = ['north', 'south', 'west', 'east'];
    arms.forEach((arm) => {
      let score = zoneMetrics[arm] ? zoneMetrics[arm].risk_score : 50;
      if (state.simulateNearMissActive && arm === state.simulateNearMissArm) {
        score = 94;
      }

      const card = dom.armCards[arm];
      const scoreEl = dom.armScores[arm];
      const statusEl = dom.armStatuses[arm];

      if (scoreEl) scoreEl.textContent = score;

      if (card) {
        card.classList.remove('arm-green', 'arm-amber', 'arm-red');
        if (score < CONFIG.THRESHOLDS.LOW) {
          card.classList.add('arm-green');
          if (statusEl) statusEl.textContent = 'Safe Flow · Low Risk';
        } else if (score < CONFIG.THRESHOLDS.HIGH) {
          card.classList.add('arm-amber');
          if (statusEl) statusEl.textContent = 'Medium Congestion';
        } else {
          card.classList.add('arm-red');
          if (statusEl) statusEl.textContent = '⚠️ Critical Traffic';
        }
      }
    });
  }

  function applyPolylineStyle(road) {
    const score = road.currentScore;
    const color = getRiskColor(score);
    const isHigh = score >= CONFIG.THRESHOLDS.HIGH;
    const isSelected = (state.selectedSegmentId === (road.feature.properties.id || road.name));

    if (road.polyline) {
      road.polyline.setStyle({
        color: color,
        weight: isSelected ? 9 : (road.isArm ? 8 : 6),
        opacity: isSelected ? 1.0 : 0.95
      });

      const pathEl = road.polyline.getElement();
      if (pathEl) {
        if (isHigh) {
          pathEl.classList.add('road-pulse');
        } else {
          pathEl.classList.remove('road-pulse');
        }
      }
    }
  }

  // ==========================================================================
  // Area Risk Gauge & Summary
  // ==========================================================================
  function updateAreaRiskIndex() {
    const keys = Object.keys(state.roadLayers);
    if (keys.length === 0) return;

    let sum = 0;
    let green = 0;
    let amber = 0;
    let red = 0;

    keys.forEach((k) => {
      const s = Number(state.roadLayers[k].currentScore) || 35;
      sum += s;
      if (s < CONFIG.THRESHOLDS.LOW) green++;
      else if (s < CONFIG.THRESHOLDS.HIGH) amber++;
      else red++;
    });

    const avg = Math.round(sum / keys.length);

    if (dom.countGreen) dom.countGreen.textContent = green;
    if (dom.countAmber) dom.countAmber.textContent = amber;
    if (dom.countRed) dom.countRed.textContent = red;

    if (dom.gaugeValue) {
      dom.gaugeValue.textContent = avg;
      dom.gaugeValue.style.color = getRiskColor(avg);
    }

    if (dom.areaRiskSummaryTag) {
      if (avg < CONFIG.THRESHOLDS.LOW) {
        dom.areaRiskSummaryTag.textContent = 'Low Traffic Risk';
        dom.areaRiskSummaryTag.className = 'badge text-green';
      } else if (avg < CONFIG.THRESHOLDS.HIGH) {
        dom.areaRiskSummaryTag.textContent = 'Medium Congestion';
        dom.areaRiskSummaryTag.className = 'badge text-amber';
      } else {
        dom.areaRiskSummaryTag.textContent = 'HEAVY TRAFFIC HAZARD';
        dom.areaRiskSummaryTag.className = 'badge text-red';
      }
    }

    if (dom.gaugeProgressArc) {
      const totalLen = 283;
      const progress = Math.min(1, Math.max(0, avg / 100));
      const offset = totalLen * (1 - progress);
      dom.gaugeProgressArc.style.strokeDashoffset = offset;
      dom.gaugeProgressArc.style.stroke = getRiskColor(avg);
    }

    if (dom.gaugeNeedle) {
      const deg = -90 + (avg / 100) * 180;
      dom.gaugeNeedle.style.transform = `rotate(${deg}deg)`;
    }
  }

  // ==========================================================================
  // Alerts & Automated Engineer Dispatch
  // ==========================================================================
  function triggerHighRiskAlert(road) {
    const segId = road.feature.properties.id || road.name;
    const now = Date.now();

    const lastAlert = state.alertCooldowns[segId] || 0;
    if (now - lastAlert < CONFIG.ALERT_COOLDOWN_MS) {
      return;
    }
    state.alertCooldowns[segId] = now;

    const score = Math.round(road.currentScore);
    const corridorName = road.name;
    const rootCause = road.rootCause || 'Heavy traffic congestion';
    const timestampStr = new Date().toLocaleTimeString();

    playAlertBeep();
    showCriticalBanner(corridorName, score, segId);
    showToast(`TRAFFIC ALERT: ${corridorName} reached risk score ${score}! Dispatch sent.`, 'danger');

    addAlertLogEntry({
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      score: score,
      corridor: corridorName,
      segmentId: segId,
      rootCause: rootCause,
      timestamp: timestampStr,
      engineer: state.engineer
    });
  }

  function showCriticalBanner(corridorName, score, segId) {
    if (!dom.highRiskBanner) return;
    dom.bannerTitle.textContent = `CRITICAL COLLISION RISK ALERT (Score: ${score})`;
    dom.bannerDetails.textContent = `High collision risk detected on ${corridorName}. Automated SMS + Email dispatched to ${state.engineer.name}.`;
    dom.highRiskBanner.classList.remove('hidden');

    dom.bannerViewBtn.onclick = () => {
      selectRoad(segId);
    };

    dom.bannerDispatchBtn.onclick = () => {
      openDirectDispatch(corridorName, score);
    };
  }

  function addAlertLogEntry(alertItem) {
    state.alerts.unshift(alertItem);
    if (state.alerts.length > 25) state.alerts.pop();

    if (dom.alertCountBadge) dom.alertCountBadge.textContent = state.alerts.length;
    if (dom.alertsEmptyState) dom.alertsEmptyState.classList.add('hidden');

    const itemEl = document.createElement('div');
    itemEl.className = 'alert-item';
    itemEl.innerHTML = `
      <div class="alert-item-header">
        <span class="alert-corridor-name">${alertItem.corridor}</span>
        <span class="alert-score-tag">SCORE ${alertItem.score}</span>
      </div>
      <div class="alert-cause-text">Root cause: ${alertItem.rootCause}</div>
      <div class="alert-item-footer">
        <span class="alert-time">${alertItem.timestamp}</span>
        <span class="alert-dispatch-pill">Dispatched: ${alertItem.engineer.name.split(',')[0]} (SMS+Email)</span>
        <button class="alert-deep-link" onclick="window.RoadAche.selectRoad('${alertItem.segmentId}')">Select Road</button>
      </div>
    `;

    dom.alertsList.insertBefore(itemEl, dom.alertsList.firstChild);
  }

  function openDirectDispatch(corridor, score) {
    const payload = `CRITICAL ROAD SAFETY ALERT: High collision risk (Score: ${score}) detected at ${corridor}. Immediate inspection requested. (RoadAche Radar)`;
    const mailUrl = `mailto:${encodeURIComponent(state.engineer.email)}?subject=${encodeURIComponent(`URGENT: RoadAche Alert - ${corridor}`)}&body=${encodeURIComponent(payload)}`;

    window.open(mailUrl, '_blank');
    showToast(`Prefilled dispatch payload prepared for ${state.engineer.name}`, 'success');
  }

  function showToast(message, type = 'neutral') {
    if (!dom.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'danger' ? 'toast-danger' : (type === 'success' ? 'toast-success' : '')}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'danger' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️')}</span>
      <span>${message}</span>
    `;

    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // ==========================================================================
  // "Simulate Near-Miss" Feature (Key N)
  // ==========================================================================
  function triggerSimulateNearMiss() {
    if (state.simulateNearMissActive) {
      showToast('Near-miss simulation is already running', 'neutral');
      return;
    }

    state.simulateNearMissActive = true;
    const durationSec = CONFIG.SIMULATE_NEAR_MISS_DURATION_MS / 1000;
    let remaining = durationSec;

    dom.simulateBtn.classList.add('btn-crimson');
    dom.simulateBtn.querySelector('span:nth-child(2)').textContent = `Simulating... (${remaining}s)`;

    // Select Cuttack Road or North Arm during simulation
    selectRoad('seg-cuttack-road');

    updateAllCorridorRisks();

    const countdown = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        dom.simulateBtn.querySelector('span:nth-child(2)').textContent = `Simulating... (${remaining}s)`;
      }
    }, 1000);

    state.simulateNearMissTimer = setTimeout(() => {
      clearInterval(countdown);
      state.simulateNearMissActive = false;
      dom.simulateBtn.classList.remove('btn-crimson');
      dom.simulateBtn.querySelector('span:nth-child(2)').textContent = 'Simulate Near-Miss';
      showToast('Simulated near-miss event resolved. Corridors stabilizing.', 'success');
      updateAllCorridorRisks();
    }, CONFIG.SIMULATE_NEAR_MISS_DURATION_MS);
  }

  // ==========================================================================
  // Road Engineer Contact Settings
  // ==========================================================================
  function loadEngineerContact() {
    try {
      const stored = localStorage.getItem('roadache_engineer');
      if (stored) {
        state.engineer = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Could not read engineer contact from localStorage:', e);
    }
    renderEngineerContact();
  }

  function renderEngineerContact() {
    if (dom.displayEngineerName) dom.displayEngineerName.textContent = state.engineer.name;
    if (dom.displayEngineerPhone) dom.displayEngineerPhone.textContent = state.engineer.phone;
    if (dom.displayEngineerEmail) dom.displayEngineerEmail.textContent = state.engineer.email;

    const testMsg = `RoadAche Radar test notification for ${state.engineer.name}`;
    if (dom.quickSmsLink) {
      dom.quickSmsLink.href = `sms:${encodeURIComponent(state.engineer.phone)}?body=${encodeURIComponent(testMsg)}`;
    }
    if (dom.quickEmailLink) {
      dom.quickEmailLink.href = `mailto:${encodeURIComponent(state.engineer.email)}?subject=RoadAche%20Contact%20Verification&body=${encodeURIComponent(testMsg)}`;
    }
  }

  function handleSaveEngineerContact(e) {
    e.preventDefault();
    const name = dom.inputEngineerName.value.trim();
    const phone = dom.inputEngineerPhone.value.trim();
    const email = dom.inputEngineerEmail.value.trim();

    if (!name) {
      showContactFormError('Please enter a valid engineer name.');
      return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7) {
      showContactFormError('Please enter a valid phone number with at least 7 digits.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showContactFormError('Please enter a valid email address.');
      return;
    }

    state.engineer = { name, phone, email };
    try {
      localStorage.setItem('roadache_engineer', JSON.stringify(state.engineer));
    } catch (err) {
      console.warn('LocalStorage save failed:', err);
    }

    renderEngineerContact();
    closeContactEditForm();
    showToast('Road engineer contact updated & saved to localStorage.', 'success');
  }

  function showContactFormError(msg) {
    if (dom.contactFormError) {
      dom.contactFormError.textContent = msg;
      dom.contactFormError.classList.remove('hidden');
    }
  }

  function openContactEditForm() {
    dom.inputEngineerName.value = state.engineer.name;
    dom.inputEngineerPhone.value = state.engineer.phone;
    dom.inputEngineerEmail.value = state.engineer.email;
    if (dom.contactFormError) dom.contactFormError.classList.add('hidden');

    dom.contactDisplayView.classList.add('hidden');
    dom.contactEditForm.classList.remove('hidden');
    dom.editContactBtn.classList.add('hidden');
  }

  function closeContactEditForm() {
    dom.contactEditForm.classList.add('hidden');
    dom.contactDisplayView.classList.remove('hidden');
    dom.editContactBtn.classList.remove('hidden');
  }

  // ==========================================================================
  // Map Navigation & Focus
  // ==========================================================================
  function focusVideoFeed() {
    highlightVideoCard();
    if (state.map) {
      state.map.setView([CONFIG.CENTER.lat, CONFIG.CENTER.lng], 17, { animate: true });
      if (state.cameraMarker) state.cameraMarker.openPopup();
    }
  }

  function highlightVideoCard() {
    if (!dom.videoWrapper) return;
    dom.videoWrapper.style.transition = 'box-shadow 0.3s ease, outline 0.3s ease';
    dom.videoWrapper.style.outline = '3px solid #E11D48';
    dom.videoWrapper.style.boxShadow = '0 0 25px rgba(225, 29, 72, 0.6)';
    setTimeout(() => {
      dom.videoWrapper.style.outline = 'none';
      dom.videoWrapper.style.boxShadow = 'none';
    }, 1800);
  }

  function handleUrlHash() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#segment=')) {
      const segId = hash.replace('#segment=', '');
      setTimeout(() => selectRoad(segId), 500);
    }
  }

  // ==========================================================================
  // Event Listeners
  // ==========================================================================
  function setupEventListeners() {
    dom.simulateBtn.addEventListener('click', triggerSimulateNearMiss);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'n' || e.key === 'N') {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        triggerSimulateNearMiss();
      }
    });

    dom.bannerDismissBtn.addEventListener('click', () => {
      dom.highRiskBanner.classList.add('hidden');
    });

    // Road selection dropdown change
    if (dom.roadSelectDropdown) {
      dom.roadSelectDropdown.addEventListener('change', (e) => {
        if (e.target.value) {
          selectRoad(e.target.value);
        }
      });
    }

    // Map Recenter & Camera Focus
    dom.recenterBtn.addEventListener('click', () => {
      const sideKm = Math.sqrt(CONFIG.AREA_KM2 || 2);
      const halfSideKm = sideKm / 2;
      const dLat = halfSideKm / 111;
      const latRad = (CONFIG.CENTER.lat * Math.PI) / 180;
      const dLng = halfSideKm / (111 * Math.cos(latRad));

      const southWest = [CONFIG.CENTER.lat - dLat, CONFIG.CENTER.lng - dLng];
      const northEast = [CONFIG.CENTER.lat + dLat, CONFIG.CENTER.lng + dLng];
      const bounds = L.latLngBounds(southWest, northEast);
      state.map.fitBounds(bounds, { animate: true });
    });

    dom.focusCamBtn.addEventListener('click', () => {
      focusVideoFeed();
    });

    // Clear Alert Logs
    dom.clearLogsBtn.addEventListener('click', () => {
      state.alerts = [];
      dom.alertsList.innerHTML = '';
      if (dom.alertsEmptyState) dom.alertsEmptyState.classList.remove('hidden');
      if (dom.alertCountBadge) dom.alertCountBadge.textContent = '0';
      showToast('Alert log cleared.', 'neutral');
    });

    dom.editContactBtn.addEventListener('click', openContactEditForm);
    dom.cancelContactBtn.addEventListener('click', closeContactEditForm);
    dom.contactEditForm.addEventListener('submit', handleSaveEngineerContact);

    Object.keys(dom.armCards).forEach((arm) => {
      const card = dom.armCards[arm];
      if (card) {
        card.addEventListener('click', () => {
          const segConfig = CONFIG.JUNCTION_ARMS[arm];
          if (segConfig) selectRoad(segConfig.segmentId);
        });
      }
    });

    window.addEventListener('hashchange', handleUrlHash);
  }

  // ==========================================================================
  // Runtime Fallbacks
  // ==========================================================================
  function generateRuntimeFallbackDetections() {
    const fps = 30;
    const duration = 30.0;
    const frames = [];
    const secSummary = [];

    for (let s = 0; s < 30; s++) {
      secSummary.push({
        second: s,
        vehicle_count: 8 + (s % 4),
        min_gap_px: 28.0,
        max_iou: 0.08,
        speed_drops: 1,
        near_misses: 1,
        risk_score: 72 + (s % 6),
        zones: {
          top: { risk_score: 64 + (s % 4), vehicle_count: 3 },
          bottom: { risk_score: 58, vehicle_count: 3 },
          left: { risk_score: 78, vehicle_count: 4 },
          right: { risk_score: 82, vehicle_count: 5 }
        }
      });
    }

    for (let f = 0; f < 450; f++) {
      const t = f / 15.0;
      frames.push({
        frame: f,
        t: t,
        vehicles: [
          { id: 1, class: 'car', bbox: [280, 100, 312, 150], zone: 'top', conf: 0.89, conflict: false },
          { id: 2, class: 'car', bbox: [330, 210, 362, 260], zone: 'bottom', conf: 0.92, conflict: false },
          { id: 3, class: 'bus', bbox: [120, 190, 185, 230], zone: 'left', conf: 0.95, conflict: false },
          { id: 4, class: 'truck', bbox: [450, 140, 515, 180], zone: 'right', conf: 0.87, conflict: true }
        ]
      });
    }

    return {
      metadata: { is_simulated: true, duration_sec: duration },
      seconds_summary: secSummary,
      frames: frames
    };
  }

  // Expose public API
  window.RoadAche = {
    selectRoad,
    focusVideoFeed,
    triggerSimulateNearMiss
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
