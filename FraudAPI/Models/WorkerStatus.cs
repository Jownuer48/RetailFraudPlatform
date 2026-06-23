using System.ComponentModel.DataAnnotations;

namespace FraudAPI.Models;

public class WorkerStatus
{
    [Key]
    [MaxLength(100)]
    public string WorkerId { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Status { get; set; } = "ONLINE";

    public Guid? CurrentJobId { get; set; }

    [MaxLength(100)]
    public string? CurrentTransactionId { get; set; }

    [MaxLength(100)]
    public string? CurrentCameraId { get; set; }

    public int ProcessedJobs { get; set; }

    public int FailedJobs { get; set; }

    [MaxLength(2000)]
    public string? LastError { get; set; }

    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime LastSeenAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}