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

    [MaxLength(1000)]
    public string? EvidenceVideoPath { get; set; }

    [MaxLength(1000)]
    public string? EvidenceVideoUrl { get; set; }

    public double? EvidenceClipStartSec { get; set; }

    public double? EvidenceClipEndSec { get; set; }

    [MaxLength(4000)]
    public string? RoiConfigJson { get; set; }

    // --- ส่วนการตรวจทาน (Human Review / Audit) ---

    [MaxLength(50)]
    public string ReviewStatus { get; set; } = "NEEDS_REVIEW";

    [MaxLength(100)]
    public string? ReviewedBy { get; set; }

    [MaxLength(2000)]
    public string? ReviewNote { get; set; }

    public DateTime? ReviewedAtUtc { get; set; }
}