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
}