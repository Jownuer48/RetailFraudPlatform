import cv2
import numpy as np
import time
from ultralytics import YOLO
import supervision as sv

print("Loading YOLOv8 + ByteTrack...")
model = YOLO('yolov8n.pt')
cap = cv2.VideoCapture(1)

# กำหนดโซนหน้าเคาน์เตอร์เหมือนเดิม
polygon = np.array([
    [150, 150], [490, 150],
    [490, 480], [150, 480]
])
zone = sv.PolygonZone(polygon=polygon)
zone_annotator = sv.PolygonZoneAnnotator(zone=zone, color=sv.Color.RED, thickness=2)

# เครื่องมือวาดกรอบและวาดป้ายชื่อ (Label)
box_annotator = sv.BoxAnnotator()
label_annotator = sv.LabelAnnotator()

# Dictionary สำหรับเก็บเวลาของลูกค้าแต่ละคน (ผูกกับ ID)
person_timers = {} 

while cap.isOpened():
    success, frame = cap.read()
    if not success: break

    # 1. ใช้คำสั่ง model.track() แทน model() เพื่อเปิดระบบจำ ID (ByteTrack) 
    # กำหนด classes=[0] เพื่อให้สนใจแค่ "คน" อย่างเดียว
    results = model.track(frame, persist=True, classes=[0], verbose=False)[0]
    detections = sv.Detections.from_ultralytics(results)
    
    # 2. เช็คคนในโซน
    zone_mask = zone.trigger(detections=detections)
    
    labels = []
    
    # 3. ลอจิกจับเวลา
    # ถ้าตรวจพบคนและระบบสร้าง ID (tracker_id) ให้คนๆ นั้นแล้ว
    if detections.tracker_id is not None:
        for is_in_zone, tracker_id in zip(zone_mask, detections.tracker_id):
            
            if is_in_zone:
                # ถ้าเพิ่งเดินเข้าโซนครั้งแรก ให้เริ่มบันทึกเวลา
                if tracker_id not in person_timers:
                    person_timers[tracker_id] = time.time() 
                
                # คำนวณว่ายืนอยู่ในโซนกี่วินาทีแล้ว
                elapsed_time = int(time.time() - person_timers[tracker_id])
                
                # เขียนข้อความแจ้งสถานะ
                status_text = f"ID: {tracker_id} | In Zone: {elapsed_time}s"
                labels.append(status_text)
                
            else:
                # ถ้าเดินออกนอกโซน
                labels.append(f"ID: {tracker_id} | Out of zone")
                # (สำหรับ MVP เราจะลบเวลาทิ้งถ้าระบบจับได้ว่าเดินออกไปแล้ว)
                if tracker_id in person_timers:
                    del person_timers[tracker_id]
                    
    # 4. วาดผลลัพธ์ทั้งหมดลงบนภาพ
    frame = zone_annotator.annotate(scene=frame)
    frame = box_annotator.annotate(scene=frame, detections=detections)
    
    if len(labels) > 0:
        frame = label_annotator.annotate(scene=frame, detections=detections, labels=labels)

    # แสดงผล
    cv2.putText(frame, "AI Audit: Checking Presence...", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
    cv2.imshow("Phase 3: Tracking & Timer", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()