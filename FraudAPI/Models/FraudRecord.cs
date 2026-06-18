using System.ComponentModel.DataAnnotations;

namespace FraudAPI.Models
{
    public class FraudRecord
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        [MaxLength(50)]
        public string TransactionId { get; set; } = string.Empty;
        
        [Required]
        [MaxLength(20)]
        public string RiskLevel { get; set; } = string.Empty; // HIGH หรือ LOW
        
        public int FraudScore { get; set; } // คะแนน 0-100
        
        public double PresenceTimeSec { get; set; } // เวลายืนในโซน (วินาที)
        
        public double TotalVideoSec { get; set; } // ความยาวคลิปทั้งหมด (วินาที)
        
        [MaxLength(255)]
        public string Reason { get; set; } = string.Empty; // เหตุผลประกอบจาก AI
        
        public DateTime AnalyzedAt { get; set; } = DateTime.Now; // เวลาที่บันทึก
    }
}