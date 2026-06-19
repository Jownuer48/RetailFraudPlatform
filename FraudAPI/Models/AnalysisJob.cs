using System.ComponentModel.DataAnnotations;

namespace FraudAPI.Models;

public class AnalysisJob
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(100)]
    public string TransactionId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? CameraId { get; set; }

    [Required]
    [MaxLength(1000)]
    public string VideoPath { get; set; } = string.Empty;

    [Required]
    [MaxLength(32)]
    public string Status { get; set; } = AnalysisJobStatus.Queued;

    [MaxLength(100)]
    public string? WorkerId { get; set; }

    [MaxLength(100)]
    public string? ErrorCode { get; set; }

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public int RetryCount { get; set; } = 0;

    public int MaxRetryCount { get; set; } = 3;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? StartedAtUtc { get; set; }

    public DateTime? FinishedAtUtc { get; set; }

    public DateTime? LastHeartbeatAtUtc { get; set; }
}