using FraudAPI.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration; // <-- เพิ่มตัวนี้เพื่อให้อ่านไฟล์ JSON ได้
using System;
using System.Threading.Tasks;

using FraudAPI.Models;     // เพื่อให้มันรู้จัก FraudRecord
using FraudAPI.Services;   // เพื่อให้มันรู้จัก RabbitMQService

namespace FraudAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AnalysisController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _config; // <-- เพิ่มตัวแปรนี้สำหรับเก็บ Config

        // ถอด AiAnalysisService ออก แล้วใช้แค่ AppDbContext สำหรับจัดการ Database
        // เพิ่ม IConfiguration เข้ามาใน Constructor
        public AnalysisController(AppDbContext context, IConfiguration config)
        {
            _context = context;
            _config = config;
        }

        // Data Transfer Object (DTO) สำหรับรับข้อมูลขาเข้าจาก React
        public class AnalyzeRequestDto
        {
            public string TransactionId { get; set; } = string.Empty;
            public string VideoPath { get; set; } = string.Empty;
        }

        [HttpPost("trigger")]
        public IActionResult TriggerAnalysis([FromBody] AnalyzeRequestDto request)
        {
            // 1. Validation ตรวจสอบข้อมูลเบื้องต้น
            if (string.IsNullOrEmpty(request.TransactionId) || string.IsNullOrEmpty(request.VideoPath))
            {
                return BadRequest(new { Message = "กรุณาระบุ TransactionId และ VideoPath ให้ครบถ้วน" });
            }

            Console.WriteLine($"\n[Backend] 📥 ได้รับคำสั่งตรวจจับสำหรับ Transaction: {request.TransactionId}");

            // 2. โยนงานเข้าคิว RabbitMQ ให้ Worker ไปจัดการต่อเบื้องหลัง
            try
            {
                // 👇 โยน _config เข้าไปให้ RabbitMQService อ่านค่ารหัสผ่านจาก appsettings.json
                var rabbit = new RabbitMQService(_config);
                rabbit.SendMessage(request.TransactionId, request.VideoPath);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = "ไม่สามารถเชื่อมต่อระบบคิว (RabbitMQ) ได้", Error = ex.Message });
            }

            // 3. ตอบกลับหน้าเว็บทันทีว่ารับเรื่องแล้ว (ไม่ต้องรอ AI วิเคราะห์เสร็จ)
            return Ok(new 
            { 
                status = "Job Enqueued",
                message = "ฝากงานเข้าคิวให้ AI เรียบร้อยแล้ว ระบบกำลังประมวลผลอยู่เบื้องหลัง!" 
            });
        }

        // -----------------------------------------------------------------
        // [จุดเชื่อมต่อใหม่] Endpoint สำหรับให้ Python ส่งผลลัพธ์กลับมาเซฟลง Database
        // -----------------------------------------------------------------
        [HttpPost("result")]
        public async Task<IActionResult> ReceiveAiResult([FromBody] AiResultPayload result)
        {
            Console.WriteLine($"\n[C#] 🎉 ได้รับผลลัพธ์จาก AI สำหรับ: {result.TransactionId}");
            Console.WriteLine($"Risk Level: {result.RiskLevel} | Score: {result.FraudScore}");

            // 1. สร้าง Record ใหม่เตรียมบันทึกลงฐานข้อมูล
            var newRecord = new FraudRecord
            {
                TransactionId = result.TransactionId,
                RiskLevel = result.RiskLevel,
                FraudScore = result.FraudScore,
                Reason = result.Reason,
                AnalyzedAt = DateTime.UtcNow // แสตมป์เวลาปัจจุบัน
            };

            // 2. บันทึกลง Database
            try
            {
                _context.FraudRecords.Add(newRecord);
                await _context.SaveChangesAsync();
                Console.WriteLine($"[C#] 💾 บันทึกผลลัพธ์ลง Database เรียบร้อย!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[C#] ❌ Error ตอนเซฟลง DB: {ex.Message}");
                return StatusCode(500, new { Message = "AI ตรวจสำเร็จ แต่ไม่สามารถเซฟลง Database ได้", Error = ex.Message });
            }
            
            return Ok(new { message = "Result received and saved to database successfully" });
        }

        // แถม Endpoint สำหรับให้ฝั่ง React ดึงข้อมูลทั้งหมดไปโชว์บนหน้าตาราง Dashboard
        [HttpGet("history")]
        public async Task<IActionResult> GetAnalysisHistory()
        {
            var history = await _context.FraudRecords
                .OrderByDescending(r => r.AnalyzedAt)
                .ToListAsync();
            return Ok(history);
        }
    }

    // Class กล่องรับข้อมูลให้ตรงกับที่ Python ส่งมา
    public class AiResultPayload
    {
        public string TransactionId { get; set; } = string.Empty;
        public string RiskLevel { get; set; } = string.Empty;
        public int FraudScore { get; set; }
        public double PresenceTimeSec { get; set; }
        public double TotalVideoSec { get; set; }
        public string Reason { get; set; } = string.Empty;
    }
}