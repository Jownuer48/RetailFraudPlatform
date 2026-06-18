from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, AliasChoices
from ultralytics import YOLO
import supervision as sv
import cv2
import numpy as np
import os

app = FastAPI(title="AI Fraud Analytics API")

# โหลดโมเดล YOLOv8 
print("Loading AI Model...")
model = YOLO('yolov8n.pt')

# Schema สำหรับรับคำสั่งจาก ASP.NET Core
# Schema สำหรับรับคำสั่ง (รับจบทุกรูปแบบชื่อที่ C# จะส่งมา)
class VideoAnalysisRequest(BaseModel):
    transaction_id: str = Field(validation_alias=AliasChoices('transaction_id', 'transactionId', 'TransactionId'))
    video_path: str = Field(validation_alias=AliasChoices('video_path', 'videoPath', 'VideoPath'))

@app.get("/")
def health_check():
    return {"status": "AI Engine is running!"}

@app.post("/api/analyze")
async def analyze_video(request: VideoAnalysisRequest):
    # 1. เช็คว่าไฟล์วิดีโอมีอยู่จริงไหม
    if not os.path.exists(request.video_path):
        raise HTTPException(status_code=404, detail=f"Video file not found at {request.video_path}")

    # 2. เปิดวิดีโอและดึงค่า FPS (Frame Per Second) เพื่อเอามาคำนวณเวลาที่แม่นยำ
    cap = cv2.VideoCapture(request.video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps == 0: fps = 30 # ตั้งค่าพื้นฐานกันเหนียว

    # 3. กำหนดโซนหน้าเคาน์เตอร์ (ROI) - ปรับพิกัดตามหน้างานจริงได้
    polygon = np.array([[150, 150], [490, 150], [490, 480], [150, 480]])
    zone = sv.PolygonZone(polygon=polygon)

    frames_in_zone = 0
    total_frames = 0

    print(f"กำลังวิเคราะห์วิดีโอ Transaction: {request.transaction_id}...")

    # 4. วนลูปอ่านทุกเฟรมในวิดีโอ (ทำงานเบื้องหลัง ไม่เปิดหน้าต่าง UI)
    while cap.isOpened():
        success, frame = cap.read()
        if not success: 
            break
        
        total_frames += 1

        # ให้ AI ตรวจคน
        results = model.track(frame, persist=True, classes=[0], verbose=False, tracker="bytetrack.yaml")[0]
        detections = sv.Detections.from_ultralytics(results)

        # ถ้าระบบจับได้ว่ามีคนอยู่ในโซนสีแดง ให้บวกจำนวนเฟรมเพิ่มเข้าไป
        if len(detections) > 0 and zone.trigger(detections=detections).any():
            frames_in_zone += 1

    cap.release()

    # 5. คำนวณสรุปผล
    time_in_zone_sec = frames_in_zone / fps
    total_video_sec = total_frames / fps

    # ลอจิกจับทุจริตแบบง่าย (MVP): ถ้ายืนอยู่หน้าเคาน์เตอร์รวมกันน้อยกว่า 5 วินาที ถือว่าน่าสงสัย (อาจจะเป็นการเติมลอย)
    is_fraud = time_in_zone_sec < 5.0
    fraud_score = 95 if is_fraud else 10

    # ส่ง JSON กลับไปให้ ASP.NET Core
    return {
        "transactionId": request.transaction_id,
        "riskLevel": "HIGH" if is_fraud else "LOW",
        "fraudScore": fraud_score,
        "presenceTimeSec": round(time_in_zone_sec, 2),
        "totalVideoSec": round(total_video_sec, 2),
        "reason": "Customer presence is suspiciously low." if is_fraud else "Normal transaction."
    }