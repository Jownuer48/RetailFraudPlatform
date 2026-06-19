import json
import os
import time
from pathlib import Path

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


# ============================================================
# 2. Load AI Model
# ============================================================

print("กำลังโหลดโมเดล AI สำหรับ Worker...")
print(f"Model path: {MODEL_PATH}")

model = YOLO(MODEL_PATH)

print("โหลดโมเดลสำเร็จ")


# ============================================================
# 3. Video Processing Logic
# ============================================================

def process_video(transaction_id: str, video_path: str) -> dict:
    """
    วิเคราะห์วิดีโอ:
    - ตรวจจับคนด้วย YOLO
    - เช็คว่าคนอยู่ใน ROI หน้าเคาน์เตอร์หรือไม่
    - คำนวณ presence time
    - สรุป risk level
    """

    video_file = Path(video_path)

    if not video_file.exists():
        raise FileNotFoundError(f"ไม่พบไฟล์วิดีโอ: {video_path}")

    cap = cv2.VideoCapture(str(video_file))

    if not cap.isOpened():
        raise RuntimeError(f"เปิดวิดีโอไม่ได้: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps is None or fps <= 0:
        fps = 30

    # ROI หน้าเคาน์เตอร์
    # Production phase ควรย้ายไป config/database
    polygon = np.array([
        [150, 150],
        [490, 150],
        [490, 480],
        [150, 480]
    ])

    zone = sv.PolygonZone(polygon=polygon)

    frames_in_zone = 0
    total_frames = 0

    try:
        while cap.isOpened():
            success, frame = cap.read()

            if not success:
                break

            total_frames += 1

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

    finally:
        cap.release()

    time_in_zone_sec = frames_in_zone / fps
    total_video_sec = total_frames / fps

    is_fraud = time_in_zone_sec < 5.0
    fraud_score = 95 if is_fraud else 10

    return {
        "transactionId": transaction_id,
        "riskLevel": "HIGH" if is_fraud else "LOW",
        "fraudScore": fraud_score,
        "presenceTimeSec": round(time_in_zone_sec, 2),
        "totalVideoSec": round(total_video_sec, 2),
        "reason": (
            "Customer presence is suspiciously low."
            if is_fraud
            else "Normal transaction."
        )
    }


# ============================================================
# 4. Backend Job Status Update
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
# 5. RabbitMQ Connection
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
# 6. Message Callback
# ============================================================

def callback(ch, method, properties, body):
    """
    ทำงานเมื่อมี job ใหม่เข้า fraud_queue

    Manual ACK strategy:
    - ถ้าวิเคราะห์สำเร็จ และ POST กลับ Backend สำเร็จ -> ACK
    - ถ้า Backend ล่มชั่วคราว -> NACK + requeue
    - ถ้า video path ผิด -> Mark FAILED + Reject ไม่ requeue
    """

    delivery_tag = method.delivery_tag

    job_id = None
    transaction_id = None
    video_path = None

    try:
        raw_message = body.decode("utf-8")
        data = json.loads(raw_message)

        job_id = data.get("jobId")
        transaction_id = data.get("transactionId")
        video_path = data.get("videoPath")

        if not transaction_id:
            raise ValueError("transactionId is required")

        if not video_path:
            raise ValueError("videoPath is required")

        print("\n========================================")
        print("ได้รับงานใหม่จาก RabbitMQ")
        print(f"JobId: {job_id}")
        print(f"Transaction: {transaction_id}")
        print(f"Video path: {video_path}")
        print("========================================")

        if job_id:
            mark_job_processing(job_id)
        else:
            print("คำเตือน: message นี้ไม่มี jobId ระบบจะบันทึก FraudRecord ได้ แต่ update job status ไม่ได้")

        result_data = process_video(transaction_id, video_path)

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

    except requests.RequestException as error:
        print(f"ส่งผลกลับ Backend ไม่สำเร็จ: {error}")
        print("NACK และ requeue งานนี้ เพราะ Backend อาจล่มชั่วคราว")

        ch.basic_nack(
            delivery_tag=delivery_tag,
            requeue=True
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
# 7. Worker Main
# ============================================================

def main():
    connection = create_rabbitmq_connection()
    channel = connection.channel()

    channel.queue_declare(
        queue=RABBITMQ_QUEUE,
        durable=True
    )

    # ให้ worker รับทีละ 1 งานก่อน
    # ป้องกันเครื่องทำ AI หลายวิดีโอพร้อมกันจน RAM/CPU เต็ม
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