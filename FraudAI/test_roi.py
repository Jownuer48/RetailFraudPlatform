import cv2
import numpy as np
from ultralytics import YOLO
import supervision as sv

print("Loading YOLOv8 Model...")
model = YOLO('yolov8n.pt')

# เปิดกล้อง (ใช้เลข 0 หรือ 1 ตามที่คุณเทสผ่านเมื่อกี้เลยครับ)
cap = cv2.VideoCapture(1)

# กำหนดพิกัดสร้างกรอบ ROI (Region of Interest) หน้าเคาน์เตอร์
# สมมติว่ากล้องความละเอียด 640x480 เราจะวาดสี่เหลี่ยมไว้ตรงกลางค่อนไปด้านล่าง
polygon = np.array([
    [150, 150], [490, 150],
    [490, 480], [150, 480]
])

# เรียกใช้เครื่องมือของ Supervision
zone = sv.PolygonZone(polygon=polygon)
zone_annotator = sv.PolygonZoneAnnotator(zone=zone, color=sv.Color.RED, thickness=2)
box_annotator = sv.BoxAnnotator()

print("Camera Opened! Press 'q' to exit.")

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    # 1. ให้ YOLO ตรวจจับคนแบบเงียบๆ
    results = model(frame, verbose=False)[0]
    
    # 2. แปลงผลลัพธ์ให้อยู่ในฟอร์แมตของ Supervision
    detections = sv.Detections.from_ultralytics(results)
    
    # กรองเอาเฉพาะ "คน" (class_id ของคนใน YOLO คือ 0)
    detections = detections[detections.class_id == 0]

    # 3. เช็คว่ามีคนอยู่ในโซนสีแดงหรือไม่
    zone_mask = zone.trigger(detections=detections)
    people_in_zone = len(detections[zone_mask]) # นับจำนวนคนในโซน

    # 4. วาดผลลัพธ์ลงบนภาพ
    # วาดกรอบคน
    frame = box_annotator.annotate(scene=frame, detections=detections)
    # วาดกรอบโซนสีแดง (ROI)
    frame = zone_annotator.annotate(scene=frame)
    
    # ใส่ตัวหนังสือแสดงจำนวนคนในโซน
    text = f"Customer at counter: {people_in_zone}"
    color = (0, 255, 0) if people_in_zone > 0 else (0, 0, 255)
    cv2.putText(frame, text, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

    # แสดงผล
    cv2.imshow("Fraud Detection - ROI Zone", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()