namespace FraudAPI.DTOs;

public sealed record WorkerHeartbeatRequest(
    string WorkerId,
    string? Status,
    Guid? CurrentJobId,
    string? CurrentTransactionId,
    string? CurrentCameraId,
    int? ProcessedJobs,
    int? FailedJobs,
    string? LastError
);