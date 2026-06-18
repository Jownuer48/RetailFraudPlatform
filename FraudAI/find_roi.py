# ทำไว้เพื่อกำหนดพิๆกัดของ ROI ด้วยการคลิกเมาส์บนภาพจากวิดีโอ เพื่อทดสอบสาขาโดยเจาะจงเช่นแค่1-2สาขา

import cv2

# ฟังก์ชันรับค่าเมื่อคลิกเมาส์ 
def click_event(event, x, y, flags, params):
    if event == cv2.EVENT_LBUTTONDOWN:
        print(f"[{x}, {y}],") # พิมพ์พิกัดลง Terminal
        cv2.circle(img, (x, y), 5, (0, 0, 255), -1) # วาดจุดสีแดงให้เห็น
        cv2.imshow("Click 4 points for ROI", img)

# เปลี่ยนชื่อไฟล์ให้ตรงกับวิดีโอที่คุณมี
video_path = 'test_normal.mp4' 
cap = cv2.VideoCapture(video_path)

success, img = cap.read()
if success:
    print("-----------------------------------------")
    print("👇 คลิกเมาส์ซ้าย 4 จุด บนพื้นที่ที่ 'ลูกค้าควรจะยืน'")
    print("   (แนะนำให้คลิกเรียงตามมุม: บนซ้าย -> บนขวา -> ล่างขวา -> ล่างซ้าย)")
    print("   เมื่อคลิกเสร็จ ให้กดปุ่ม 'q' บนคีย์บอร์ดเพื่อออก")
    print("-----------------------------------------")
    
    cv2.imshow("Click 4 points for ROI", img)
    cv2.setMouseCallback("Click 4 points for ROI", click_event)
    cv2.waitKey(0)

cap.release()
cv2.destroyAllWindows()