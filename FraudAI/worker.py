import json
import os
import time
from pathlib import Path
from typing import Optional, Any

import cv2
import numpy as np
import pika
import requests
import supervision as sv
import shutil
import subprocess
import threading
from ultralytics import YOLO

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


# ============================================================
# 1. Load Environment Config
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env")

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_AMQP_PORT", "5673"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "fraud_user")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASS", "fraud_pass_2026")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "fraud_queue")
RABBITMQ_FAILED_QUEUE = os.getenv("RABBITMQ_FAILED_QUEUE", "fraud_failed_queue")
RABBITMQ_DLX = os.getenv("RABBITMQ_DLX", "fraud_dlx")

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:5233")

BACKEND_WEBHOOK_URL = os.getenv(
    "BACKEND_WEBHOOK_URL", f"{BACKEND_BASE_URL}/api/Analysis/result"
)

MODEL_PATH_ENV = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")

if os.path.isabs(MODEL_PATH_ENV):
    MODEL_PATH = MODEL_PATH_ENV
else:
    MODEL_PATH = str(BASE_DIR / MODEL_PATH_ENV)

# ใช้กัน RTSP หรือวิดีโอยาวมากไม่ให้ worker รันไม่จบ
MAX_ANALYSIS_SECONDS = int(os.getenv("MAX_ANALYSIS_SECONDS", "30"))

FRAME_STRIDE = int(os.getenv("FRAME_STRIDE", "1"))

WORKER_ID = os.getenv("WORKER_ID", f"fraud-worker-{os.getpid()}")
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "10"))

WORKER_STATUS_HEARTBEAT_INTERVAL_SECONDS = int(
    os.getenv("WORKER_STATUS_HEARTBEAT_INTERVAL_SECONDS", "10")
)

_worker_status_lock = threading.Lock()
_current_job_id = None
_current_transaction_id = None
_current_camera_id = None
_processed_jobs = 0
_failed_jobs = 0
_last_error = None

EVIDENCE_IMAGE_DIR = Path(
    os.getenv(
        "EVIDENCE_IMAGE_DIR",
        str(PROJECT_ROOT / "FraudAPI" / "wwwroot" / "evidence" / "images"),
    )
)

EVIDENCE_IMAGE_URL_PREFIX = os.getenv("EVIDENCE_IMAGE_URL_PREFIX", "/evidence/images")

EVIDENCE_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

##########################################################################################################################
##############Evidence Video Config Path##################################################################################
##########################################################################################################################

EVIDENCE_VIDEO_DIR = Path(
    os.getenv(
        "EVIDENCE_VIDEO_DIR",
        str(PROJECT_ROOT / "FraudAPI" / "wwwroot" / "evidence" / "clips"),
    )
)

EVIDENCE_VIDEO_URL_PREFIX = os.getenv("EVIDENCE_VIDEO_URL_PREFIX", "/evidence/clips")

EVIDENCE_CLIP_SECONDS = int(os.getenv("EVIDENCE_CLIP_SECONDS", "15"))

EVIDENCE_VIDEO_DIR.mkdir(parents=True, exist_ok=True)

##########################################################################################################################


# ============================================================
# 2. Load AI Model
# ============================================================

print("กำลังโหลดโมเดล AI สำหรับ Worker...")
print(f"Model path: {MODEL_PATH}")

model = YOLO(MODEL_PATH)

print("โหลดโมเดลสำเร็จ")


# ============================================================
# 3. Camera Config / Source Resolver
# ============================================================


def get_camera_config(camera_id: str) -> dict:
    url = f"{BACKEND_BASE_URL}/api/Cameras/{camera_id}"

    response = requests.get(url, timeout=10)
    response.raise_for_status()

    return response.json()


def parse_roi_config(roi_config_json: Optional[str]) -> Optional[list[list[int]]]:
    if not roi_config_json:
        return None

    try:
        roi_polygon = json.loads(roi_config_json)

        if not isinstance(roi_polygon, list) or len(roi_polygon) < 3:
            raise ValueError("ROI polygon must contain at least 3 points")

        return roi_polygon

    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid roiConfigJson: {error}") from error


def resolve_video_source(
    camera_id: Optional[str], fallback_video_path: Optional[str]
) -> tuple[str, str, Optional[list[list[int]]], Optional[dict[str, Any]]]:
    """
    คืนค่า:
    - video_source: path หรือ rtsp url
    - source_type: FILE / RTSP
    - roi_polygon: polygon จาก camera config
    - camera: raw camera config
    """

    if camera_id:
        camera = get_camera_config(camera_id)

        source_type = str(camera.get("sourceType", "FILE")).upper()
        source_url = camera.get("sourceUrl")
        roi_config_json = camera.get("roiConfigJson")

        if not source_url:
            raise ValueError(f"Camera {camera_id} has no sourceUrl")

        roi_polygon = parse_roi_config(roi_config_json)

        if source_type == "FILE":
            source_path = Path(source_url)

            if not source_path.is_absolute():
                source_path = BASE_DIR / source_path

            return str(source_path), source_type, roi_polygon, camera

        if source_type == "RTSP":
            return str(source_url), source_type, roi_polygon, camera

        raise ValueError(f"Unsupported camera source type: {source_type}")

    if fallback_video_path:
        return fallback_video_path, "FILE", None, None

    raise ValueError("cameraId or videoPath is required")


# ============================================================
# 4. Video Processing Logic
# ============================================================


def build_polygon(roi_polygon: Optional[list[list[int]]]) -> np.ndarray:
    if roi_polygon:
        return np.array(roi_polygon, dtype=np.int32)

    return np.array(
        [
            [150, 150],
            [490, 150],
            [490, 480],
            [150, 480],
        ],
        dtype=np.int32,
    )


def open_video_capture(video_source: str, source_type: str) -> cv2.VideoCapture:
    source_type = source_type.upper()

    if source_type == "FILE":
        video_file = Path(video_source)

        if not video_file.exists():
            raise FileNotFoundError(f"ไม่พบไฟล์วิดีโอ: {video_source}")

        return cv2.VideoCapture(str(video_file))

    if source_type == "RTSP":
        return cv2.VideoCapture(video_source)

    raise ValueError(f"Unsupported video source type: {source_type}")


def map_risk_level(fraud_score: int) -> str:
    if fraud_score >= 70:
        return "HIGH"

    if fraud_score >= 40:
        return "MEDIUM"

    return "LOW"


def calculate_fraud_score(
    presence_time_sec: float,
    total_video_sec: float,
    frames_in_zone: int,
    analyzed_frames: int,
) -> tuple[int, str]:
    """
    Rule-based scoring engine v1

    Score:
    - 0-39   LOW
    - 40-69  MEDIUM
    - 70-100 HIGH
    """

    if total_video_sec <= 0 or analyzed_frames <= 0:
        return 100, "Video could not be analyzed properly."

    presence_ratio = presence_time_sec / total_video_sec

    # Case 1: ไม่มีคนใน ROI เลย
    if frames_in_zone <= 0:
        return (
            95,
            "No customer presence detected in ROI during the transaction window.",
        )

    # Case 2: อยู่สั้นมาก
    if presence_time_sec < 3:
        return (88, f"Customer presence was extremely short: {presence_time_sec:.2f}s.")

    # Case 3: อยู่ต่ำกว่า 5 วิ
    if presence_time_sec < 5:
        return (
            76,
            f"Customer presence was suspiciously low: {presence_time_sec:.2f}s.",
        )

    # Case 4: อยู่ใน ROI น้อยกว่า 25% ของเวลาทั้งหมด
    if presence_ratio < 0.25:
        return (
            62,
            (
                f"Customer presence ratio was low: "
                f"{presence_ratio * 100:.1f}% of the analyzed window."
            ),
        )

    # Case 5: อยู่ระดับพอใช้ แต่ยังไม่แน่น
    if presence_ratio < 0.45:
        return (
            38,
            (
                f"Customer presence was acceptable but not strong: "
                f"{presence_time_sec:.2f}s out of {total_video_sec:.2f}s."
            ),
        )

    # Case 6: ปกติ
    return (
        10,
        (
            f"Customer presence was normal: "
            f"{presence_time_sec:.2f}s out of {total_video_sec:.2f}s."
        ),
    )


def sanitize_filename(value: str) -> str:
    safe_chars = []

    for char in value:
        if char.isalnum() or char in ("-", "_"):
            safe_chars.append(char)
        else:
            safe_chars.append("_")

    return "".join(safe_chars)


def draw_evidence_overlay(
    frame,
    polygon: np.ndarray,
    detections: Optional[sv.Detections],
    transaction_id: str,
    risk_hint: str = "ANALYSIS",
):
    output = frame.copy()

    cv2.polylines(output, [polygon], isClosed=True, color=(0, 255, 255), thickness=3)

    cv2.putText(
        output,
        f"TXN: {transaction_id}",
        (24, 36),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    cv2.putText(
        output,
        f"ROI / {risk_hint}",
        (24, 72),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 255, 255),
        2,
        cv2.LINE_AA,
    )

    if detections is not None and len(detections) > 0:
        for index, xyxy in enumerate(detections.xyxy):
            x1, y1, x2, y2 = map(int, xyxy)

            cv2.rectangle(output, (x1, y1), (x2, y2), (0, 255, 0), 2)

            cv2.putText(
                output,
                f"person #{index + 1}",
                (x1, max(24, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2,
                cv2.LINE_AA,
            )

    return output


def save_evidence_snapshot(
    frame,
    polygon: np.ndarray,
    detections: Optional[sv.Detections],
    transaction_id: str,
    frame_number: int,
    risk_hint: str = "ANALYSIS",
) -> tuple[str, str]:
    safe_transaction_id = sanitize_filename(transaction_id)
    timestamp = int(time.time())

    file_name = f"{safe_transaction_id}_frame_{frame_number}_{timestamp}.jpg"
    output_path = EVIDENCE_IMAGE_DIR / file_name

    evidence_frame = draw_evidence_overlay(
        frame=frame,
        polygon=polygon,
        detections=detections,
        transaction_id=transaction_id,
        risk_hint=risk_hint,
    )

    success = cv2.imwrite(str(output_path), evidence_frame)

    if not success:
        raise RuntimeError(f"ไม่สามารถบันทึก evidence snapshot ได้: {output_path}")

    evidence_url = f"{EVIDENCE_IMAGE_URL_PREFIX}/{file_name}"

    return str(output_path), evidence_url


def get_ffmpeg_path() -> str | None:
    configured_path = os.getenv("FFMPEG_PATH")

    if configured_path and Path(configured_path).exists():
        return configured_path

    found_path = shutil.which("ffmpeg")

    if found_path:
        return found_path

    candidates = [
        Path(r"C:\Program Files\Gyan\FFmpeg\bin\ffmpeg.exe"),
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
    ]

    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    winget_packages = (
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    )

    if winget_packages.exists():
        for ffmpeg_exe in winget_packages.rglob("ffmpeg.exe"):
            return str(ffmpeg_exe)

    return None


def transcode_video_to_h264(input_path: Path, output_path: Path) -> bool:
    ffmpeg_path = get_ffmpeg_path()

    if not ffmpeg_path:
        print("ไม่พบ ffmpeg ในเครื่อง คลิปอาจเปิดบน browser ไม่ได้")
        return False

    print(f"ใช้ ffmpeg: {ffmpeg_path}")

    command = [
        ffmpeg_path,
        "-y",
        "-i",
        str(input_path),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        str(output_path),
    ]

    result = subprocess.run(command, capture_output=True, text=True)

    if result.returncode != 0:
        print("แปลงคลิปเป็น H.264 ไม่สำเร็จ")
        print(result.stderr[-1500:])
        return False

    return output_path.exists() and output_path.stat().st_size > 0


def save_evidence_clip_from_file(
    video_source: str,
    transaction_id: str,
    center_frame_number: int,
    fps: float,
    total_frames: int,
):
    if not video_source:
        return None, None, None, None

    video_file = Path(video_source)

    if not video_file.exists():
        print(f"ไม่พบไฟล์วิดีโอสำหรับตัด clip: {video_source}")
        return None, None, None, None

    if fps <= 0:
        fps = 30

    half_clip_frames = int((EVIDENCE_CLIP_SECONDS * fps) / 2)

    start_frame = max(0, center_frame_number - half_clip_frames)
    end_frame = min(total_frames - 1, center_frame_number + half_clip_frames)

    clip_start_sec = start_frame / fps
    clip_end_sec = end_frame / fps

    safe_transaction_id = sanitize_filename(transaction_id)
    timestamp = int(time.time())

    raw_file_name = f"{safe_transaction_id}_raw_clip_{timestamp}.mp4"
    final_file_name = (
        f"{safe_transaction_id}_clip_"
        f"{int(clip_start_sec)}_{int(clip_end_sec)}_{timestamp}.mp4"
    )

    raw_output_path = EVIDENCE_VIDEO_DIR / raw_file_name
    final_output_path = EVIDENCE_VIDEO_DIR / final_file_name

    cap = cv2.VideoCapture(str(video_file))

    if not cap.isOpened():
        print(f"เปิดวิดีโอเพื่อตัด clip ไม่ได้: {video_source}")
        return None, None, None, None

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if width <= 0 or height <= 0:
        cap.release()
        print("ขนาดวิดีโอไม่ถูกต้อง ไม่สามารถตัด clip ได้")
        return None, None, None, None

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    writer = cv2.VideoWriter(str(raw_output_path), fourcc, fps, (width, height))

    if not writer.isOpened():
        cap.release()
        print(f"สร้าง VideoWriter ไม่สำเร็จ: {raw_output_path}")
        return None, None, None, None

    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        current_frame = start_frame

        while current_frame <= end_frame:
            success, frame = cap.read()

            if not success:
                break

            writer.write(frame)
            current_frame += 1

    finally:
        writer.release()
        cap.release()

    if not raw_output_path.exists() or raw_output_path.stat().st_size <= 0:
        print(f"ตัด evidence clip ไม่สำเร็จหรือไฟล์ว่าง: {raw_output_path}")
        return None, None, None, None

    converted = transcode_video_to_h264(
        input_path=raw_output_path, output_path=final_output_path
    )

    if converted:
        try:
            raw_output_path.unlink()
        except Exception:
            pass

        evidence_video_url = f"{EVIDENCE_VIDEO_URL_PREFIX}/{final_file_name}"

        return (
            str(final_output_path),
            evidence_video_url,
            round(clip_start_sec, 2),
            round(clip_end_sec, 2),
        )

    print("ใช้ raw mp4v แทน แต่ browser อาจเล่นไม่ได้")

    evidence_video_url = f"{EVIDENCE_VIDEO_URL_PREFIX}/{raw_file_name}"

    return (
        str(raw_output_path),
        evidence_video_url,
        round(clip_start_sec, 2),
        round(clip_end_sec, 2),
    )


def process_video(
    transaction_id: str,
    video_source: str,
    source_type: str = "FILE",
    roi_polygon: Optional[list[list[int]]] = None,
    job_id: Optional[str] = None,
) -> dict:
    """
    วิเคราะห์วิดีโอ:
    - FILE: ใช้ไฟล์ demo หรือไฟล์จาก NVR export
    - RTSP: อ่านจากกล้อง/NVR stream
    - ตรวจจับคนด้วย YOLO
    - เช็คว่าคนอยู่ใน ROI หรือไม่
    - คำนวณ presence time
    - สรุป risk level
    """

    source_type = source_type.upper()

    cap = open_video_capture(video_source, source_type)

    if not cap.isOpened():
        raise RuntimeError(f"เปิดวิดีโอไม่ได้: {video_source}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps is None or fps <= 0:
        fps = 30

    polygon = build_polygon(roi_polygon)
    zone = sv.PolygonZone(polygon=polygon)

    frames_in_zone = 0
    total_frames = 0
    analyzed_frames = 0
    last_heartbeat_at = 0.0
    evidence_frame = None
    evidence_detections = None
    evidence_frame_number = None
    evidence_priority = -1

    max_frames = None
    if MAX_ANALYSIS_SECONDS > 0:
        max_frames = int(fps * MAX_ANALYSIS_SECONDS)

    print(f"เริ่มวิเคราะห์ Transaction: {transaction_id}")
    print(f"Source type: {source_type}")
    print(f"Source: {video_source}")
    print(f"FPS: {fps}")
    print(f"Max analysis seconds: {MAX_ANALYSIS_SECONDS}")
    print(f"ROI: {polygon.tolist()}")

    try:
        while cap.isOpened():
            success, frame = cap.read()

            if not success:
                break

            total_frames += 1

            if max_frames is not None and total_frames > max_frames:
                print("ถึงเวลาวิเคราะห์สูงสุดแล้ว หยุดอ่านวิดีโอ")
                break

            if FRAME_STRIDE > 1 and total_frames % FRAME_STRIDE != 0:
                continue

            analyzed_frames += 1

            now_ts = time.time()

            if job_id and now_ts - last_heartbeat_at >= HEARTBEAT_INTERVAL_SECONDS:
                mark_job_heartbeat(job_id)
                last_heartbeat_at = now_ts

            results = model.track(
                frame,
                persist=True,
                classes=[0],
                verbose=False,
                tracker="bytetrack.yaml",
            )[0]

            detections = sv.Detections.from_ultralytics(results)

            # เก็บ evidence frame แบบ priority:
            # 2 = มีคนอยู่ใน ROI
            # 1 = เจอคน แต่ไม่เข้า ROI
            # 0 = frame ปกติพร้อม ROI
            if evidence_priority < 0:
                evidence_frame = frame.copy()
                evidence_detections = detections
                evidence_frame_number = total_frames
                evidence_priority = 0

            if len(detections) > 0:
                in_zone = zone.trigger(detections=detections)

                if evidence_priority < 1:
                    evidence_frame = frame.copy()
                    evidence_detections = detections
                    evidence_frame_number = total_frames
                    evidence_priority = 1

                if in_zone.any():
                    frames_in_zone += 1

                    if evidence_priority < 2:
                        evidence_frame = frame.copy()
                        evidence_detections = detections
                        evidence_frame_number = total_frames
                        evidence_priority = 2

            if analyzed_frames % 100 == 0:
                print(
                    f"Progress: total_frames={total_frames}, "
                    f"analyzed_frames={analyzed_frames}, "
                    f"frames_in_zone={frames_in_zone}"
                )

    finally:
        cap.release()

    if total_frames <= 0:
        raise RuntimeError(f"ไม่พบ frame ในวิดีโอหรือ stream: {video_source}")

    effective_fps = fps / FRAME_STRIDE if FRAME_STRIDE > 1 else fps

    time_in_zone_sec = frames_in_zone / effective_fps
    total_video_sec = total_frames / fps

    fraud_score, reason = calculate_fraud_score(
        presence_time_sec=time_in_zone_sec,
        total_video_sec=total_video_sec,
        frames_in_zone=frames_in_zone,
        analyzed_frames=analyzed_frames,
    )

    risk_level = map_risk_level(fraud_score)

    evidence_image_path = None
    evidence_image_url = None

    if evidence_frame is not None and evidence_frame_number is not None:
        evidence_image_path, evidence_image_url = save_evidence_snapshot(
            frame=evidence_frame,
            polygon=polygon,
            detections=evidence_detections,
            transaction_id=transaction_id,
            frame_number=evidence_frame_number,
            risk_hint=risk_level,
        )

        print(f"บันทึก Evidence Snapshot สำเร็จ: {evidence_image_path}")

    evidence_video_path = None
    evidence_video_url = None
    evidence_clip_start_sec = None
    evidence_clip_end_sec = None

    if source_type == "FILE" and evidence_frame_number is not None:
        (
            evidence_video_path,
            evidence_video_url,
            evidence_clip_start_sec,
            evidence_clip_end_sec,
        ) = save_evidence_clip_from_file(
            video_source=video_source,
            transaction_id=transaction_id,
            center_frame_number=evidence_frame_number,
            fps=fps,
            total_frames=total_frames,
        )

        if evidence_video_path:
            print(f"บันทึก Evidence Clip สำเร็จ: {evidence_video_path}")

    return {
        "transactionId": transaction_id,
        "riskLevel": risk_level,
        "fraudScore": fraud_score,
        "presenceTimeSec": round(time_in_zone_sec, 2),
        "totalVideoSec": round(total_video_sec, 2),
        "reason": reason,
        "sourceType": source_type,
        "evidenceImagePath": evidence_image_path,
        "evidenceImageUrl": evidence_image_url,
        "evidenceFrameNumber": evidence_frame_number,
        "evidenceVideoPath": evidence_video_path,
        "evidenceVideoUrl": evidence_video_url,
        "evidenceClipStartSec": evidence_clip_start_sec,
        "evidenceClipEndSec": evidence_clip_end_sec,
        "roiConfigJson": json.dumps(polygon.tolist()),
    }


# ============================================================
# 5. Backend Job Status Update
# ============================================================


def mark_job_processing(job_id: str):
    if not job_id:
        return

    url = f"{BACKEND_BASE_URL}/api/Analysis/jobs/{job_id}/processing"

    response = requests.post(url, timeout=10)
    response.raise_for_status()

    print(f"อัปเดต Job เป็น PROCESSING สำเร็จ: {job_id}")


def mark_job_heartbeat(job_id: str):
    if not job_id:
        return

    url = f"{BACKEND_BASE_URL}/api/Analysis/jobs/{job_id}/heartbeat"

    response = requests.post(url, json={"workerId": WORKER_ID}, timeout=10)

    response.raise_for_status()

    print(f"ส่ง Heartbeat สำเร็จ: {job_id} / {WORKER_ID}")


def mark_job_failed(job_id: str, error_message: str):
    if not job_id:
        return

    url = f"{BACKEND_BASE_URL}/api/Analysis/jobs/{job_id}/failed"

    response = requests.post(url, json={"errorMessage": error_message}, timeout=10)

    response.raise_for_status()

    print(f"อัปเดต Job เป็น FAILED สำเร็จ: {job_id}")


# ============================================================
# 6. RabbitMQ Connection
# ============================================================


def create_rabbitmq_connection() -> pika.BlockingConnection:
    credentials = pika.PlainCredentials(username=RABBITMQ_USER, password=RABBITMQ_PASS)

    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300,
    )

    max_retries = 10

    for attempt in range(1, max_retries + 1):
        try:
            print(
                f"กำลังเชื่อมต่อ RabbitMQ "
                f"{RABBITMQ_HOST}:{RABBITMQ_PORT} "
                f"(attempt {attempt}/{max_retries})"
            )

            return pika.BlockingConnection(parameters)

        except pika.exceptions.AMQPConnectionError as error:
            print(f"เชื่อมต่อ RabbitMQ ไม่สำเร็จ: {error}")
            time.sleep(3)

    raise RuntimeError("เชื่อมต่อ RabbitMQ ไม่สำเร็จหลัง retry หลายครั้ง")


def set_worker_current_job(job_id=None, transaction_id=None, camera_id=None):
    global _current_job_id
    global _current_transaction_id
    global _current_camera_id

    with _worker_status_lock:
        _current_job_id = job_id
        _current_transaction_id = transaction_id
        _current_camera_id = camera_id


def increment_worker_processed_jobs():
    global _processed_jobs
    global _last_error

    with _worker_status_lock:
        _processed_jobs += 1
        _last_error = None


def increment_worker_failed_jobs(error_message: str):
    global _failed_jobs
    global _last_error

    with _worker_status_lock:
        _failed_jobs += 1
        _last_error = error_message


def build_worker_heartbeat_payload():
    with _worker_status_lock:
        return {
            "workerId": WORKER_ID,
            "status": "ONLINE",
            "currentJobId": _current_job_id,
            "currentTransactionId": _current_transaction_id,
            "currentCameraId": _current_camera_id,
            "processedJobs": _processed_jobs,
            "failedJobs": _failed_jobs,
            "lastError": _last_error,
        }


def send_worker_status_heartbeat():
    url = f"{BACKEND_BASE_URL}/api/Workers/heartbeat"

    payload = build_worker_heartbeat_payload()

    response = requests.post(url, json=payload, timeout=10)

    response.raise_for_status()


def worker_status_heartbeat_loop():
    while True:
        try:
            send_worker_status_heartbeat()
            print(f"ส่ง Worker Health สำเร็จ: {WORKER_ID}")
        except Exception as error:
            print(f"ส่ง Worker Health ไม่สำเร็จ: {error}")

        time.sleep(WORKER_STATUS_HEARTBEAT_INTERVAL_SECONDS)


def start_worker_status_heartbeat_thread():
    thread = threading.Thread(target=worker_status_heartbeat_loop, daemon=True)

    thread.start()


# ============================================================
# 7. Message Callback
# ============================================================


def callback(ch, method, properties, body):
    """
    ทำงานเมื่อมี job ใหม่เข้า fraud_queue

    Manual ACK strategy:
    - วิเคราะห์สำเร็จ + POST กลับ Backend สำเร็จ -> ACK
    - Backend webhook ล่มชั่วคราว -> NACK + requeue
    - video/camera/source ผิด -> Mark FAILED + Reject ไม่ requeue
    """

    delivery_tag = method.delivery_tag

    job_id = None
    transaction_id = None
    camera_id = None
    video_path = None

    try:
        raw_message = body.decode("utf-8")
        data = json.loads(raw_message)

        job_id = data.get("jobId")
        transaction_id = data.get("transactionId")
        camera_id = data.get("cameraId")
        video_path = data.get("videoPath")

        set_worker_current_job(
            job_id=job_id,
            transaction_id=transaction_id,
            camera_id=camera_id
        )

        if not transaction_id:
            raise ValueError("transactionId is required")

        if not camera_id and not video_path:
            raise ValueError("cameraId or videoPath is required")

        print("\n========================================")
        print("ได้รับงานใหม่จาก RabbitMQ")
        print(f"JobId: {job_id}")
        print(f"Transaction: {transaction_id}")
        print(f"CameraId: {camera_id}")
        print(f"Video path fallback: {video_path}")
        print("========================================")

        if job_id:
            mark_job_processing(job_id)
        else:
            print(
                "คำเตือน: message นี้ไม่มี jobId ระบบจะบันทึก FraudRecord ได้ แต่ update job status ไม่ได้"
            )

        video_source, source_type, roi_polygon, camera = resolve_video_source(
            camera_id=camera_id,
            fallback_video_path=video_path
        )

        if camera:
            print(
                f"Camera resolved: "
                f"{camera.get('id')} / "
                f"{camera.get('storeId')} / "
                f"{camera.get('cameraName')}"
            )

        print(f"Resolved source type: {source_type}")
        print(f"Resolved source: {video_source}")

        result_data = process_video(
            transaction_id=transaction_id,
            video_source=video_source,
            source_type=source_type,
            roi_polygon=roi_polygon,
            job_id=job_id,
        )

        if job_id:
            result_data["jobId"] = job_id

        print(
            f"AI วิเคราะห์เสร็จ: "
            f"Risk={result_data['riskLevel']}, "
            f"Score={result_data['fraudScore']}, "
            f"Presence={result_data['presenceTimeSec']}s"
        )

        response = requests.post(
            BACKEND_WEBHOOK_URL,
            json=result_data,
            timeout=20
        )

        response.raise_for_status()

        print(f"ส่งผลลัพธ์กลับ Backend สำเร็จ: {BACKEND_WEBHOOK_URL}")

        increment_worker_processed_jobs()

        ch.basic_ack(delivery_tag=delivery_tag)

        print(f"ACK งานสำเร็จ Transaction: {transaction_id}")

    except requests.RequestException as error:
        print(f"เกิดปัญหาการเชื่อมต่อ HTTP: {error}")

        try:
            status_code = getattr(error.response, "status_code", None)

            if status_code == 404:
                increment_worker_failed_jobs(str(error))

                if job_id:
                    mark_job_failed(
                        job_id,
                        f"Camera config not found or endpoint returned 404: {error}",
                    )

                ch.basic_reject(delivery_tag=delivery_tag, requeue=False)
            else:
                print("NACK และ requeue งานนี้ เพราะ Backend อาจล่มชั่วคราว")

                ch.basic_nack(delivery_tag=delivery_tag, requeue=True)

        except Exception as notify_error:
            print(f"จัดการ HTTP error ไม่สำเร็จ: {notify_error}")

            ch.basic_nack(delivery_tag=delivery_tag, requeue=True)

    except FileNotFoundError as error:
        print(f"ไฟล์วิดีโอไม่ถูกต้อง: {error}")

        increment_worker_failed_jobs(str(error))

        try:
            if job_id:
                mark_job_failed(job_id, str(error))
        except Exception as notify_error:
            print(f"แจ้ง Backend ว่า FAILED ไม่สำเร็จ: {notify_error}")

        print("Reject งานนี้แบบไม่ requeue เพื่อกัน loop ไม่จบ")

        ch.basic_reject(delivery_tag=delivery_tag, requeue=False)

    except Exception as error:
        print(f"เกิดข้อผิดพลาดระหว่างประมวลผลงาน: {error}")

        increment_worker_failed_jobs(str(error))

        try:
            if job_id:
                mark_job_failed(job_id, str(error))
        except Exception as notify_error:
            print(f"แจ้ง Backend ว่า FAILED ไม่สำเร็จ: {notify_error}")

        print("Reject งานนี้แบบไม่ requeue ชั่วคราว จนกว่าจะมี Dead Letter Queue")

        ch.basic_reject(delivery_tag=delivery_tag, requeue=False)

    finally:
        set_worker_current_job()
        
# ============================================================
# 8. Worker Main
# ============================================================


def main():
    connection = create_rabbitmq_connection()
    channel = connection.channel()

    channel.exchange_declare(
        exchange=RABBITMQ_DLX, exchange_type="direct", durable=True
    )

    channel.queue_declare(queue=RABBITMQ_FAILED_QUEUE, durable=True)

    channel.queue_bind(
        queue=RABBITMQ_FAILED_QUEUE,
        exchange=RABBITMQ_DLX,
        routing_key=RABBITMQ_FAILED_QUEUE,
    )

    channel.queue_declare(
        queue=RABBITMQ_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange": RABBITMQ_DLX,
            "x-dead-letter-routing-key": RABBITMQ_FAILED_QUEUE,
        },
    )

    channel.basic_qos(prefetch_count=1)

    channel.basic_consume(
        queue=RABBITMQ_QUEUE, on_message_callback=callback, auto_ack=False
    )

    print("\nAI Worker พร้อมทำงาน")
    print(f"RabbitMQ: {RABBITMQ_HOST}:{RABBITMQ_PORT}")
    print(f"Queue: {RABBITMQ_QUEUE}")
    print(f"Backend base URL: {BACKEND_BASE_URL}")
    print(f"Backend webhook: {BACKEND_WEBHOOK_URL}")
    print("กด Ctrl+C เพื่อหยุด\n")

    try:
        
        print("Worker started. Waiting for jobs...")
        start_worker_status_heartbeat_thread()
        channel.start_consuming()

    except KeyboardInterrupt:
        print("\nกำลังหยุด Worker...")

        if channel.is_open:
            channel.stop_consuming()

        if connection.is_open:
            connection.close()

        print("Worker หยุดเรียบร้อย")


if __name__ == "__main__":
    main()
