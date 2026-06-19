namespace FraudAPI.DTOs;

public sealed record AnalysisJobMessage(
    Guid JobId,
    string TransactionId,
    string VideoPath,
    DateTime CreatedAtUtc
);