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

BACKEND_BASE_URL = os.getenv(
    "BACKEND_BASE_URL",
    "http://localhost:5233"
)

BACKEND_WEBHOOK_URL = os.getenv(
    "BACKEND_WEBHOOK_URL",
    f"{BACKEND_BASE_URL}/api/Analysis/result"
)

MODEL_PATH_ENV = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")

if os.path.isabs(MODEL_PATH_ENV):
    MODEL_PATH = MODEL_PATH_ENV
else:
    MODEL_PATH = str(BASE_DIR / MODEL_PATH_ENV)

# ใช้กัน RTSP หรือวิดีโอยาวมากไม่ให้ worker รันไม่จบ
MAX_ANALYSIS_SECONDS = int(os.getenv("MAX_ANALYSIS_SECONDS", "30"))

# ข้ามเฟรมได้ถ้าอยากให้เร็วขึ้น เช่น 1 = วิเคราะห์ทุกเฟรม, 2 = ข้าม 1 เฟรม
FRAME_STRIDE = int(os.getenv("FRAME_STRIDE", "1"))


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
    camera_id: Optional[str],
    fallback_video_path: Optional[str]
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
        dtype=np.int32
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
    analyzed_frames: int
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
            "No customer presence detected in ROI during the transaction window."
        )

    # Case 2: อยู่สั้นมาก
    if presence_time_sec < 3:
        return (
            88,
            f"Customer presence was extremely short: {presence_time_sec:.2f}s."
        )

    # Case 3: อยู่ต่ำกว่า 5 วิ
    if presence_time_sec < 5:
        return (
            76,
            f"Customer presence was suspiciously low: {presence_time_sec:.2f}s."
        )

    # Case 4: อยู่ใน ROI น้อยกว่า 25% ของเวลาทั้งหมด
    if presence_ratio < 0.25:
        return (
            62,
            (
                f"Customer presence ratio was low: "
                f"{presence_ratio * 100:.1f}% of the analyzed window."
            )
        )

    # Case 5: อยู่ระดับพอใช้ แต่ยังไม่แน่น
    if presence_ratio < 0.45:
        return (
            38,
            (
                f"Customer presence was acceptable but not strong: "
                f"{presence_time_sec:.2f}s out of {total_video_sec:.2f}s."
            )
        )

    # Case 6: ปกติ
    return (
        10,
        (
            f"Customer presence was normal: "
            f"{presence_time_sec:.2f}s out of {total_video_sec:.2f}s."
        )
    )


def process_video(
    transaction_id: str,
    video_source: str,
    source_type: str = "FILE",
    roi_polygon: Optional[list[list[int]]] = None
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

            results = model.track(
                frame,
                persist=True,
                classes=[0],
                verbose=False,
                tracker="bytetrack.yaml"
            )[0]

            detections = sv.Detections.from_ultralytics(results)

            if len(detections) > 0:
                in_zone = zone.trigger(detections=detections)

                if in_zone.any():
                    frames_in_zone += 1

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
        analyzed_frames=analyzed_frames
    )

    risk_level = map_risk_level(fraud_score)

    return {
        "transactionId": transaction_id,
        "riskLevel": risk_level,
        "fraudScore": fraud_score,
        "presenceTimeSec": round(time_in_zone_sec, 2),
        "totalVideoSec": round(total_video_sec, 2),
        "reason": reason
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


def mark_job_failed(job_id: str, error_message: str):
    if not job_id:
        return

    url = f"{BACKEND_BASE_URL}/api/Analysis/jobs/{job_id}/failed"

    response = requests.post(
        url,
        json={
            "errorMessage": error_message
        },
        timeout=10
    )

    response.raise_for_status()

    print(f"อัปเดต Job เป็น FAILED สำเร็จ: {job_id}")


# ============================================================
# 6. RabbitMQ Connection
# ============================================================

def create_rabbitmq_connection() -> pika.BlockingConnection:
    credentials = pika.PlainCredentials(
        username=RABBITMQ_USER,
        password=RABBITMQ_PASS
    )

    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
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
            print("คำเตือน: message นี้ไม่มี jobId ระบบจะบันทึก FraudRecord ได้ แต่ update job status ไม่ได้")

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
            roi_polygon=roi_polygon
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

        ch.basic_ack(delivery_tag=delivery_tag)

        print(f"ACK งานสำเร็จ Transaction: {transaction_id}")

    except requests.RequestException as error:
        print(f"เกิดปัญหาการเชื่อมต่อ HTTP: {error}")

        # ถ้าเป็นปัญหาตอนส่งผลกลับ backend ให้ requeue ได้
        # แต่ถ้าเป็นปัญหากล้อง config 404 จาก /api/Cameras ก็ควร FAILED
        try:
            status_code = getattr(error.response, "status_code", None)

            if status_code == 404:
                if job_id:
                    mark_job_failed(job_id, f"Camera config not found or endpoint returned 404: {error}")

                ch.basic_reject(
                    delivery_tag=delivery_tag,
                    requeue=False
                )
            else:
                print("NACK และ requeue งานนี้ เพราะ Backend อาจล่มชั่วคราว")

                ch.basic_nack(
                    delivery_tag=delivery_tag,
                    requeue=True
                )

        except Exception as notify_error:
            print(f"จัดการ HTTP error ไม่สำเร็จ: {notify_error}")

            ch.basic_nack(
                delivery_tag=delivery_tag,
                requeue=True
            )

    except FileNotFoundError as error:
        print(f"ไฟล์วิดีโอไม่ถูกต้อง: {error}")

        try:
            if job_id:
                mark_job_failed(job_id, str(error))
        except Exception as notify_error:
            print(f"แจ้ง Backend ว่า FAILED ไม่สำเร็จ: {notify_error}")

        print("Reject งานนี้แบบไม่ requeue เพื่อกัน loop ไม่จบ")

        ch.basic_reject(
            delivery_tag=delivery_tag,
            requeue=False
        )

    except Exception as error:
        print(f"เกิดข้อผิดพลาดระหว่างประมวลผลงาน: {error}")

        try:
            if job_id:
                mark_job_failed(job_id, str(error))
        except Exception as notify_error:
            print(f"แจ้ง Backend ว่า FAILED ไม่สำเร็จ: {notify_error}")

        print("Reject งานนี้แบบไม่ requeue ชั่วคราว จนกว่าจะมี Dead Letter Queue")

        ch.basic_reject(
            delivery_tag=delivery_tag,
            requeue=False
        )


# ============================================================
# 8. Worker Main
# ============================================================

def main():
    connection = create_rabbitmq_connection()
    channel = connection.channel()

    channel.queue_declare(
        queue=RABBITMQ_QUEUE,
        durable=True
    )

    channel.basic_qos(prefetch_count=1)

    channel.basic_consume(
        queue=RABBITMQ_QUEUE,
        on_message_callback=callback,
        auto_ack=False
    )

    print("\nAI Worker พร้อมทำงาน")
    print(f"RabbitMQ: {RABBITMQ_HOST}:{RABBITMQ_PORT}")
    print(f"Queue: {RABBITMQ_QUEUE}")
    print(f"Backend base URL: {BACKEND_BASE_URL}")
    print(f"Backend webhook: {BACKEND_WEBHOOK_URL}")
    print("กด Ctrl+C เพื่อหยุด\n")

    try:
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