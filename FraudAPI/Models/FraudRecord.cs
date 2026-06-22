using System;
using System.ComponentModel.DataAnnotations;

namespace FraudAPI.Models;

public class FraudRecord
{
    public int Id { get; set; }

    public string TransactionId { get; set; } = string.Empty;

    public string RiskLevel { get; set; } = string.Empty;

    public int FraudScore { get; set; }

    public double PresenceTimeSec { get; set; }

    public double TotalVideoSec { get; set; }

    public string Reason { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // --- ส่วนที่เพิ่มเข้ามาใหม่ (ข้อมูลกล้องและหลักฐาน) ---

    [MaxLength(100)]
    public string? CameraId { get; set; }

    [MaxLength(50)]
    public string? SourceType { get; set; }

    [MaxLength(1000)]
    public string? EvidenceImagePath { get; set; }

    [MaxLength(1000)]
    public string? EvidenceImageUrl { get; set; }

    public int? EvidenceFrameNumber { get; set; }

    [MaxLength(4000)]
    public string? RoiConfigJson { get; set; }
}