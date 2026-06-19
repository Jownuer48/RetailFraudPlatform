namespace FraudAPI.DTOs;

public sealed record AiAnalysisResultRequest(
    Guid? JobId,
    string TransactionId,
    string RiskLevel,
    int FraudScore,
    double PresenceTimeSec,
    double TotalVideoSec,
    string Reason
);