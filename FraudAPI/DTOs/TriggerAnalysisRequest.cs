namespace FraudAPI.DTOs;

public sealed record TriggerAnalysisRequest(
    string TransactionId,
    string? CameraId,
    string? VideoPath
);