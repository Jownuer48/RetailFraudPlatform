namespace FraudAPI.DTOs;

public sealed record StoreUpsertRequest(
    string Id,
    string StoreName,
    string? Region,
    string? Address,
    bool IsActive
);