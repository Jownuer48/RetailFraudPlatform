from ultralytics import YOLO
import cv2

print("Loading YOLOv8 Model...")
# โหลดโมเดล YOLOv8n (เวอร์ชัน Nano เล็กและเร็วสุด)
model = YOLO('yolov8n.pt') 

# เปิดกล้องเว็บแคม (เลข 0 คือกล้องตัวแรกของเครื่อง)
cap = cv2.VideoCapture(1)

print("Camera Opened! Press 'q' to exit.")

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        print("ไม่สามารถดึงภาพจากกล้องได้")
        break
        
    # ให้ YOLO ประมวลผลภาพในเฟรมนี้
    results = model(frame)
    
    # วาดกรอบ (Bounding Box) ทับลงบนภาพ
    annotated_frame = results[0].plot()
    
    # แสดงผลหน้าจอ
    cv2.imshow("YOLOv8 Detection Test", annotated_frame)
    
    # กดปุ่ม 'q' บนคีย์บอร์ดเพื่อปิดหน้าต่าง
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# คืนทรัพยากรกล้องและปิดหน้าต่างทั้งหมด
cap.release()
cv2.destroyAllWindows()