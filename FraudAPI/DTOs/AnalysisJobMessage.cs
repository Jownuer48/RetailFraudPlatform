namespace FraudAPI.DTOs;

public sealed record AnalysisJobMessage(
    Guid JobId,
    string TransactionId,
    string? CameraId,
    string VideoPath,
    DateTime CreatedAtUtc
);