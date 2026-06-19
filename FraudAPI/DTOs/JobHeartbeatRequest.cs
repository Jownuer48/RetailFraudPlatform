namespace FraudAPI.DTOs;

public sealed record JobHeartbeatRequest(
    string? WorkerId
);