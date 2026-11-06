#!/usr/bin/env python3
"""
RoadAche - YOLOv8 Traffic Footage Analysis & Collision Risk Scorer
Analyzes assets/footage.mp4 using Ultralytics YOLOv8n with tracking.
Computes frame-by-frame detections, vehicle counts, minimum gaps,
max IoU overlap, speed drops, and near-miss events.
Outputs detections.json with per-second summaries and per-arm zone scores.
"""

import os
import sys
import math
import json
import argparse
from datetime import datetime

# COCO class IDs: 2: car, 3: motorcycle, 5: bus, 7: truck
TARGET_CLASSES = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck"
}

def calculate_iou(boxA, boxB):
    """Compute Intersection-over-Union between two boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interW = max(0.0, xB - xA)
    interH = max(0.0, yB - yA)
    interArea = interW * interH

    boxAArea = max(1.0, (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]))
    boxBArea = max(1.0, (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]))

    iou = interArea / float(boxAArea + boxBArea - interArea)
    return iou

def calculate_box_gap(boxA, boxB):
    """Compute minimum edge-to-edge pixel gap between two boxes."""
    # Horizontal distance
    if boxA[2] < boxB[0]:
        dx = boxB[0] - boxA[2]
    elif boxB[2] < boxA[0]:
        dx = boxA[0] - boxB[2]
    else:
        dx = 0.0

    # Vertical distance
    if boxA[3] < boxB[1]:
        dy = boxB[1] - boxA[3]
    elif boxB[3] < boxA[1]:
        dy = boxA[1] - boxB[3]
    else:
        dy = 0.0

    return math.hypot(dx, dy)

def determine_zone(box, width, height):
    """
    Assign vehicle to one of 4 directional zones (top, bottom, left, right)
    matching the 4-way intersection arms (North, South, West, East).
    """
    cx = (box[0] + box[2]) / 2.0
    cy = (box[1] + box[3]) / 2.0
    
    # Normalized coordinates relative to center (-1 to 1)
    nx = (cx - width / 2.0) / (width / 2.0)
    ny = (cy - height / 2.0) / (height / 2.0)

    # Use angular sectors (4 quadrants at 45 degree diagonal divides)
    if abs(ny) >= abs(nx):
        return "top" if ny < 0 else "bottom"
    else:
        return "left" if nx < 0 else "right"

def compute_risk_score(count, min_gap, max_iou, speed_drops, near_misses):
    """
    Compute a normalized 0-100 collision risk score.
    High density, low gaps, high overlap, and sudden decelerations raise risk.
    """
    # Density factor (0 - 30)
    density_factor = min(30.0, count * 3.5)

    # Proximity factor (0 - 35): min_gap < 150px adds risk
    if min_gap is None or min_gap > 180.0:
        proximity_factor = 0.0
    else:
        proximity_factor = max(0.0, (1.0 - (min_gap / 180.0)) * 35.0)

    # Conflict / Overlap factor (0 - 25)
    iou_factor = min(25.0, max_iou * 60.0)

    # Dynamic events: sudden speed drops and near misses (0 - 40)
    event_factor = min(40.0, speed_drops * 12.0 + near_misses * 25.0)

    raw_score = density_factor + proximity_factor + iou_factor + event_factor
    return int(round(min(100.0, max(0.0, raw_score))))

def run_yolo_tracking(video_path, output_json, max_seconds=30):
    """Run Ultralytics YOLOv8n tracking if available, else synthetic fallback."""
    try:
        import cv2
        from ultralytics import YOLO
        print(f"[YOLOv8] Loading yolov8n.pt and processing {video_path}...")
        model = YOLO("yolov8n.pt")
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise IOError(f"Could not open video file {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 360
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        max_frames = int(min(total_frames if total_frames > 0 else 900, fps * max_seconds))

        frames_data = []
        track_history = {} # track_id -> [(t, cx, cy, vx, vy)]

        frame_idx = 0
        while cap.isOpened() and frame_idx < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            t = round(frame_idx / fps, 3)
            results = model.track(frame, persist=True, classes=list(TARGET_CLASSES.keys()), verbose=False)
            
            frame_vehicles = []
            if results and len(results) > 0 and results[0].boxes is not None:
                boxes = results[0].boxes
                for i in range(len(boxes)):
                    box = boxes.xyxy[i].cpu().numpy().tolist()
                    cls_id = int(boxes.cls[i].item())
                    cls_name = TARGET_CLASSES.get(cls_id, "vehicle")
                    track_id = int(boxes.id[i].item()) if boxes.id is not None and boxes.id[i] is not None else (i + 1)
                    conf = float(boxes.conf[i].item())

                    cx = (box[0] + box[2]) / 2.0
                    cy = (box[1] + box[3]) / 2.0
                    zone = determine_zone(box, width, height)

                    # Compute velocity & sudden speed drop
                    speed = 0.0
                    sudden_drop = False
                    if track_id in track_history:
                        prev_t, prev_cx, prev_cy, prev_vx, prev_vy = track_history[track_id]
                        dt = max(0.001, t - prev_t)
                        vx = (cx - prev_cx) / dt
                        vy = (cy - prev_cy) / dt
                        speed = math.hypot(vx, vy)
                        prev_speed = math.hypot(prev_vx, prev_vy)
                        if (prev_speed - speed) > 60.0 and prev_speed > 40.0:
                            sudden_drop = True
                        track_history[track_id] = (t, cx, cy, vx, vy)
                    else:
                        track_history[track_id] = (t, cx, cy, 0.0, 0.0)

                    frame_vehicles.append({
                        "id": track_id,
                        "class": cls_name,
                        "bbox": [round(c, 1) for c in box],
                        "zone": zone,
                        "conf": round(conf, 2),
                        "speed": round(speed, 1),
                        "sudden_drop": sudden_drop,
                        "conflict": False
                    })

            # Check conflicts within frame
            n_v = len(frame_vehicles)
            for a in range(n_v):
                for b in range(a + 1, n_v):
                    vA = frame_vehicles[a]
                    vB = frame_vehicles[b]
                    gap = calculate_box_gap(vA["bbox"], vB["bbox"])
                    iou = calculate_iou(vA["bbox"], vB["bbox"])
                    if gap < 25.0 or iou > 0.12 or (vA["sudden_drop"] and gap < 45.0) or (vB["sudden_drop"] and gap < 45.0):
                        vA["conflict"] = True
                        vB["conflict"] = True

            frames_data.append({
                "frame": frame_idx,
                "t": t,
                "vehicles": frame_vehicles
            })

            frame_idx += 1

        cap.release()
        return build_dataset(frames_data, fps, width, height, is_simulated=False)

    except Exception as e:
        print(f"[Notice] Direct YOLOv8 track execution bypassed: {e}")
        print("[Fallback] Generating synthetic physics-backed detection stream...")
        return generate_synthetic_dataset(output_json)

def generate_synthetic_dataset(output_json=None):
    """
    Generate realistic high-fidelity detection stream with 4-zone junction metrics,
    tracking trajectories, conflict occurrences, and speed changes.
    """
    fps = 30
    duration = 30.0 # 30 seconds loop
    width, height = 640, 360
    total_frames = int(fps * duration)

    # 8-12 simulated vehicles traversing the 4-way intersection
    vehicles_pool = [
        # Northbound (South to North)
        {"id": 101, "class": "car", "dir": "SB_to_NB", "t_enter": 0.0, "speed": 62, "lane": 335},
        {"id": 102, "class": "bus", "dir": "SB_to_NB", "t_enter": 3.5, "speed": 45, "lane": 355},
        {"id": 103, "class": "car", "dir": "SB_to_NB", "t_enter": 11.0, "speed": 70, "lane": 335},
        {"id": 104, "class": "truck", "dir": "SB_to_NB", "t_enter": 18.0, "speed": 40, "lane": 355},
        
        # Southbound (North to South)
        {"id": 201, "class": "car", "dir": "NB_to_SB", "t_enter": 1.0, "speed": 58, "lane": 285},
        {"id": 202, "class": "motorcycle", "dir": "NB_to_SB", "t_enter": 8.0, "speed": 75, "lane": 305},
        {"id": 203, "class": "car", "dir": "NB_to_SB", "t_enter": 15.0, "speed": 55, "lane": 285},
        
        # Eastbound (West to East)
        {"id": 301, "class": "car", "dir": "WB_to_EB", "t_enter": 0.5, "speed": 65, "lane": 205},
        {"id": 302, "class": "car", "dir": "WB_to_EB", "t_enter": 7.0, "speed": 60, "lane": 225},
        {"id": 303, "class": "bus", "dir": "WB_to_EB", "t_enter": 14.0, "speed": 48, "lane": 205},
        
        # Westbound (East to West)
        {"id": 401, "class": "car", "dir": "EB_to_WB", "t_enter": 2.0, "speed": 62, "lane": 155},
        {"id": 402, "class": "truck", "dir": "EB_to_WB", "t_enter": 9.5, "speed": 42, "lane": 135},
        {"id": 403, "class": "car", "dir": "EB_to_WB", "t_enter": 19.0, "speed": 68, "lane": 155}
    ]

    frames_data = []

    for f in range(total_frames):
        t = round(f / fps, 3)
        frame_vehicles = []

        for v in vehicles_pool:
            cycle_duration = 12.0
            elapsed = (t - v["t_enter"]) % cycle_duration
            if elapsed < 0:
                elapsed += cycle_duration

            # Compute box positions based on direction
            if v["dir"] == "SB_to_NB":
                # Moving up: y from 390 down to -60
                prog = elapsed / cycle_duration
                y_center = 390.0 - prog * 450.0
                x_center = v["lane"]
                bw, bh = (42, 68) if v["class"] in ["bus", "truck"] else (32, 52)
            elif v["dir"] == "NB_to_SB":
                # Moving down: y from -60 to 390
                prog = elapsed / cycle_duration
                y_center = -60.0 + prog * 450.0
                x_center = v["lane"]
                bw, bh = (20, 36) if v["class"] == "motorcycle" else (32, 52)
            elif v["dir"] == "WB_to_EB":
                # Moving right: x from -60 to 680
                prog = elapsed / cycle_duration
                x_center = -60.0 + prog * 740.0
                y_center = v["lane"]
                bw, bh = (68, 42) if v["class"] in ["bus", "truck"] else (52, 32)
            else: # EB_to_WB
                # Moving left: x from 680 down to -60
                prog = elapsed / cycle_duration
                x_center = 680.0 - prog * 740.0
                y_center = v["lane"]
                bw, bh = (68, 42) if v["class"] in ["bus", "truck"] else (52, 32)

            box = [
                round(x_center - bw / 2.0, 1),
                round(y_center - bh / 2.0, 1),
                round(x_center + bw / 2.0, 1),
                round(y_center + bh / 2.0, 1)
            ]

            # Only include if inside or near frame
            if box[2] >= 0 and box[0] <= width and box[3] >= 0 and box[1] <= height:
                zone = determine_zone(box, width, height)
                
                # Near-miss event injection between seconds 12.0 and 15.5
                is_conflict_event = (12.0 <= t <= 15.5 and v["id"] in [102, 302])
                sudden_drop = is_conflict_event and (13.0 <= t <= 14.5)
                
                frame_vehicles.append({
                    "id": v["id"],
                    "class": v["class"],
                    "bbox": box,
                    "zone": zone,
                    "conf": 0.88,
                    "speed": 18.0 if sudden_drop else float(v["speed"]),
                    "sudden_drop": sudden_drop,
                    "conflict": is_conflict_event
                })

        frames_data.append({
            "frame": f,
            "t": t,
            "vehicles": frame_vehicles
        })

    return build_dataset(frames_data, fps, width, height, is_simulated=True)

def build_dataset(frames_data, fps, width, height, is_simulated=False):
    """Aggregate per-frame detections into 1-second summaries and per-zone risk."""
    duration = len(frames_data) / float(fps)
    seconds_count = int(math.ceil(duration))
    seconds_summary = []

    for s in range(seconds_count):
        s_start = s * 1.0
        s_end = (s + 1) * 1.0
        s_frames = [f for f in frames_data if s_start <= f["t"] < s_end]
        if not s_frames:
            s_frames = [frames_data[-1]]

        # Aggregate counts and metrics for this second
        avg_vehicles = sum(len(f["vehicles"]) for f in s_frames) / float(len(s_frames))
        all_gaps = []
        all_ious = []
        total_speed_drops = 0
        total_near_misses = 0

        # Zone stats accumulators
        zone_counts = {"top": [], "bottom": [], "left": [], "right": []}
        zone_conflicts = {"top": 0, "bottom": 0, "left": 0, "right": 0}

        for f in s_frames:
            vehs = f["vehicles"]
            n = len(vehs)
            frame_conflicts = 0

            # Accumulate per zone
            for z in ["top", "bottom", "left", "right"]:
                z_vehs = [v for v in vehs if v["zone"] == z]
                zone_counts[z].append(len(z_vehs))
                if any(v["conflict"] for v in z_vehs):
                    zone_conflicts[z] += 1

            for a in range(n):
                if vehs[a].get("sudden_drop", False):
                    total_speed_drops += 1
                if vehs[a].get("conflict", False):
                    frame_conflicts += 1

                for b in range(a + 1, n):
                    gap = calculate_box_gap(vehs[a]["bbox"], vehs[b]["bbox"])
                    iou = calculate_iou(vehs[a]["bbox"], vehs[b]["bbox"])
                    all_gaps.append(gap)
                    all_ious.append(iou)

            if frame_conflicts > 0:
                total_near_misses += 1

        min_gap = min(all_gaps) if all_gaps else 180.0
        max_iou = max(all_ious) if all_ious else 0.0

        overall_risk = compute_risk_score(avg_vehicles, min_gap, max_iou, total_speed_drops, total_near_misses)

        # Per zone risk scores (top = North, bottom = South, left = West, right = East)
        zones_summary = {}
        for z in ["top", "bottom", "left", "right"]:
            z_avg_count = sum(zone_counts[z]) / float(len(zone_counts[z])) if zone_counts[z] else 0.0
            z_conflicts = zone_conflicts[z]
            z_risk = int(round(min(100.0, max(15.0, z_avg_count * 9.0 + z_conflicts * 28.0 + (overall_risk * 0.4)))))
            zones_summary[z] = {
                "vehicle_count": round(z_avg_count, 1),
                "risk_score": z_risk,
                "near_misses": 1 if z_conflicts > 0 else 0
            }

        seconds_summary.append({
            "second": s,
            "vehicle_count": int(round(avg_vehicles)),
            "min_gap_px": round(min_gap, 1),
            "max_iou": round(max_iou, 3),
            "speed_drops": total_speed_drops,
            "near_misses": total_near_misses,
            "risk_score": overall_risk,
            "zones": zones_summary
        })

    dataset = {
        "metadata": {
            "model": "YOLOv8n",
            "weights": "yolov8n.pt",
            "fps": fps,
            "duration_sec": round(duration, 2),
            "frame_width": width,
            "frame_height": height,
            "is_simulated": is_simulated,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "camera_id": "cam-01",
            "camera_name": "Camera 01 · 5th Ave & 42nd St",
            "classes_tracked": list(TARGET_CLASSES.values())
        },
        "seconds_summary": seconds_summary,
        # Store sampled frames (every 2nd frame = 15 fps for high performance & fast loading)
        "frames": frames_data[::2]
    }

    return dataset

def main():
    parser = argparse.ArgumentParser(description="RoadAche YOLOv8 Traffic Risk Analyzer")
    parser.add_argument("--video", default="assets/footage.mp4", help="Path to input video footage")
    parser.add_argument("--output", default="detections.json", help="Path to output detections JSON")
    parser.add_argument("--synthetic", action="store_true", help="Force synthetic fallback generation")
    args = parser.parse_args()

    # Base directory relative to script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    video_path = os.path.join(script_dir, args.video) if not os.path.isabs(args.video) else args.video
    output_path = os.path.join(script_dir, args.output) if not os.path.isabs(args.output) else args.output

    if args.synthetic or not os.path.exists(video_path):
        print(f"[RoadAche] Generating baseline detections (synthetic=True)...")
        data = generate_synthetic_dataset(output_path)
    else:
        print(f"[RoadAche] Analyzing {video_path}...")
        data = run_yolo_tracking(video_path, output_path)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"[RoadAche] Successfully saved {output_path} with {len(data['frames'])} frames and {len(data['seconds_summary'])}s summary.")

if __name__ == "__main__":
    main()
